"""
CRIS AI Object Detector
Uses OpenCV HOG + SVM for people, DNN/YOLO for vehicles.
Threaded inference for performance.
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from app.core.settings import settings

logger = logging.getLogger(__name__)

VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
PERSON_CLASS = 0

# Balanced threshold — strict enough to avoid fakes, sensitive enough for toy cars
CONFIDENCE_THRESHOLD = 0.40
NMS_THRESHOLD = 0.4
INPUT_SIZE = (320, 320)


def detect_dominant_color(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> str:
    """Detect the dominant color of a vehicle within its bounding box.

    Returns one of: 'red', 'black', 'white', 'silver', 'blue', 'other'.
    """
    x, y, w, h = bbox
    # Extract the center region of the vehicle (skip edges)
    margin_x, margin_y = max(w // 4, 1), max(h // 4, 1)
    x1 = max(0, x + margin_x)
    y1 = max(0, y + margin_y)
    x2 = min(frame.shape[1], x + w - margin_x)
    y2 = min(frame.shape[0], y + h - margin_y)

    if x2 <= x1 or y2 <= y1:
        return "unknown"

    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return "unknown"

    # Convert to HSV for more robust color detection
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    total_pixels = roi.shape[0] * roi.shape[1]

    # Red hue ranges (red wraps around 0/180 in OpenCV HSV)
    red_mask1 = cv2.inRange(hsv, np.array([0, 70, 50]), np.array([10, 255, 255]))
    red_mask2 = cv2.inRange(hsv, np.array([170, 70, 50]), np.array([180, 255, 255]))
    red_ratio = (cv2.countNonZero(red_mask1) + cv2.countNonZero(red_mask2)) / total_pixels

    # Black: low saturation, low value
    black_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 80, 80]))
    black_ratio = cv2.countNonZero(black_mask) / total_pixels

    # White: low saturation, high value
    white_mask = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([180, 40, 255]))
    white_ratio = cv2.countNonZero(white_mask) / total_pixels

    # Silver/Gray: low saturation, medium value
    silver_mask = cv2.inRange(hsv, np.array([0, 0, 100]), np.array([180, 40, 180]))
    silver_ratio = cv2.countNonZero(silver_mask) / total_pixels

    # Blue
    blue_mask = cv2.inRange(hsv, np.array([100, 70, 50]), np.array([130, 255, 255]))
    blue_ratio = cv2.countNonZero(blue_mask) / total_pixels

    # Find dominant color above threshold — lowered for toy cars
    THRESHOLD = 0.08
    colors = [
        ("red", red_ratio),
        ("black", black_ratio),
        ("white", white_ratio),
        ("silver", silver_ratio),
        ("blue", blue_ratio),
    ]
    colors.sort(key=lambda x: x[1], reverse=True)

    if colors[0][1] >= THRESHOLD:
        return colors[0][0]

    # Special fallback: if no clear dominant color, check if red or black
    # are the top two — common for toy cars
    if red_ratio > 0.05 and red_ratio >= black_ratio:
        return "red"
    if black_ratio > 0.05 and black_ratio > red_ratio:
        return "black"

    return "other"


@dataclass
class Detection:
    class_name: str
    confidence: float
    bbox: tuple[int, int, int, int]  # x, y, w, h
    center: tuple[int, int] = field(default=(0, 0))
    dominant_color: str = field(default="unknown")

    def __post_init__(self):
        x, y, w, h = self.bbox
        self.center = (x + w // 2, y + h // 2)


class ObjectDetector:
    """Production object detector using OpenCV DNN with YOLO darknet model."""

    def __init__(self, model_dir: str = None):
        self.model_dir = Path(model_dir or settings.MODEL_DIR)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.net = None
        self.output_layers = []
        self.lock = threading.Lock()
        self.frame_skip = 0
        self.last_detections: list[Detection] = []
        self._load_model()

    def _load_model(self):
        """Load YOLO model or fall back to HOG+Haar cascade."""
        weights = self.model_dir / "yolov4-tiny.weights"
        config = self.model_dir / "yolov4-tiny.cfg"

        if weights.exists() and config.exists():
            try:
                self.net = cv2.dnn.readNetFromDarknet(str(config), str(weights))
                self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                self.output_layers = self.net.getUnconnectedOutLayersNames()
                self.use_dnn = True
                logger.info("Loaded YOLOv4-tiny model successfully")
                return
            except Exception as e:
                logger.warning(f"Failed to load YOLO DNN: {e}")

        self.use_dnn = False
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self.vehicle_cascade = None
        cascade_path = cv2.data.haarcascades + "haarcascade_car.xml"
        if Path(cascade_path).exists():
            self.vehicle_cascade = cv2.CascadeClassifier(cascade_path)
        logger.info("Using HOG+Haar cascade fallback detector")

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Run detection on every frame for fast collision detection."""
        with self.lock:
            self.frame_skip += 1
            # Process every frame for fast toy car collision detection
            # (removed frame skipping for speed)

            t0 = time.time()
            if self.use_dnn:
                detections = self._detect_dnn(frame)
            else:
                detections = self._detect_hog(frame)
            elapsed = time.time() - t0
            logger.debug(f"Detection took {elapsed * 1000:.1f}ms, found {len(detections)} objects")
            self.last_detections = detections
            return detections

    def _detect_dnn(self, frame: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(frame, 1 / 255.0, INPUT_SIZE, swapRB=True, crop=False)
        self.net.setInput(blob)
        outputs = self.net.forward(self.output_layers)

        boxes, confidences, class_ids = [], [], []
        for output in outputs:
            for detection in output:
                scores = detection[5:]
                class_id = int(np.argmax(scores))
                confidence = float(scores[class_id])
                if class_id in VEHICLE_CLASSES and confidence > CONFIDENCE_THRESHOLD:
                    cx, cy, bw, bh = detection[:4]
                    x = int((cx - bw / 2) * w)
                    y = int((cy - bh / 2) * h)
                    bw, bh = int(bw * w), int(bh * h)
                    boxes.append([x, y, bw, bh])
                    confidences.append(confidence)
                    class_ids.append(class_id)
                elif class_id == PERSON_CLASS and confidence > CONFIDENCE_THRESHOLD:
                    cx, cy, bw, bh = detection[:4]
                    x = int((cx - bw / 2) * w)
                    y = int((cy - bh / 2) * h)
                    bw, bh = int(bw * w), int(bh * h)
                    boxes.append([x, y, bw, bh])
                    confidences.append(confidence)
                    class_ids.append(class_id)

        if not boxes:
            return []

        indices = cv2.dnn.NMSBoxes(boxes, confidences, CONFIDENCE_THRESHOLD, NMS_THRESHOLD)
        detections = []
        if len(indices) > 0:
            for i in indices.flatten() if hasattr(indices, "flatten") else indices:
                idx = int(i) if not isinstance(i, int) else i
                x, y, bw, bh = boxes[idx]
                cls_id = class_ids[idx]
                cls_name = VEHICLE_CLASSES.get(cls_id, "person")

                # Filter out false positives:
                # 1. Minimum size (at least 20x20 pixels)
                if bw < 20 or bh < 20:
                    continue
                # 2. Aspect ratio must be reasonable for a car (width/height between 0.3 and 5.0)
                aspect = bw / max(bh, 1)
                if aspect < 0.3 or aspect > 5.0:
                    continue
                # 3. Must not be in top/bottom 5% of frame (UI elements)
                if y < h * 0.05 or y + bh > h * 0.95:
                    continue

                color = detect_dominant_color(frame, (max(0, x), max(0, y), bw, bh))
                detections.append(
                    Detection(
                        class_name=cls_name,
                        confidence=confidences[idx],
                        bbox=(max(0, x), max(0, y), bw, bh),
                        dominant_color=color,
                    )
                )
        return detections

    def _detect_hog(self, frame: np.ndarray) -> list[Detection]:
        detections = []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        h, w = frame.shape[:2]

        try:
            boxes, weights = self.hog.detectMultiScale(gray, winStride=(8, 8), padding=(4, 4), scale=1.05)
            for (x, y, bw, bh), weight in zip(boxes, weights):
                conf = float(min(weight / 1.5, 1.0))
                if conf > CONFIDENCE_THRESHOLD:
                    detections.append(
                        Detection(
                            class_name="person",
                            confidence=conf,
                            bbox=(int(x), int(y), int(bw), int(bh)),
                        )
                    )
        except Exception as e:
            logger.debug(f"HOG detection error: {e}")

        if self.vehicle_cascade is not None:
            try:
                vehicles = self.vehicle_cascade.detectMultiScale(gray, 1.1, 5, 0, (50, 50))
                for x, y, bw, bh in vehicles:
                    # Strict filtering for Haar cascade false positives
                    if bw < 40 or bh < 40:
                        continue
                    if bw * bh < 2000:
                        continue
                    aspect = bw / max(bh, 1)
                    if aspect < 0.4 or aspect > 4.0:
                        continue
                    # Skip detections near frame edges (UI elements)
                    if y < h * 0.05 or y + bh > h * 0.95:
                        continue
                    color = detect_dominant_color(frame, (int(x), int(y), int(bw), int(bh)))
                    detections.append(
                        Detection(
                            class_name="vehicle",
                            confidence=0.70,
                            bbox=(int(x), int(y), int(bw), int(bh)),
                            dominant_color=color,
                        )
                    )
            except Exception as e:
                logger.debug(f"Haar cascade error: {e}")

        return detections
