"""
UCRIP AI Object Detector
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

CONFIDENCE_THRESHOLD = 0.45
NMS_THRESHOLD = 0.4
INPUT_SIZE = (320, 320)


@dataclass
class Detection:
    class_name: str
    confidence: float
    bbox: tuple[int, int, int, int]  # x, y, w, h
    center: tuple[int, int] = field(default=(0, 0))

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
        """Run detection on a single frame. Skips every other frame for performance."""
        with self.lock:
            self.frame_skip += 1
            if self.frame_skip % 2 == 0:
                return self.last_detections

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
                detections.append(
                    Detection(
                        class_name=cls_name,
                        confidence=confidences[idx],
                        bbox=(max(0, x), max(0, y), bw, bh),
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
                vehicles = self.vehicle_cascade.detectMultiScale(gray, 1.1, 3, 0, (40, 40))
                for x, y, bw, bh in vehicles:
                    if bw * bh > 800:
                        detections.append(
                            Detection(
                                class_name="vehicle",
                                confidence=0.80,
                                bbox=(int(x), int(y), int(bw), int(bh)),
                            )
                        )
            except Exception as e:
                logger.debug(f"Haar cascade error: {e}")

        return detections
