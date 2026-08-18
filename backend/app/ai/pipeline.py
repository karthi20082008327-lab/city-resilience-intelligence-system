"""
CRIS AI Detection Pipeline
Orchestrates detection -> tracking -> accident/fire analysis -> incident creation.
Maintains a circular frame buffer for video clip capture.
Threaded inference for 25+ FPS.
"""

import logging
import os
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np

from app.ai.accident_detector import AccidentDetector, AccidentEvent
from app.ai.detector import ObjectDetector
from app.ai.fire_detector import FireAlert, FireDetector
from app.ai.tracker import ObjectTracker
from app.core.settings import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = settings.UPLOAD_DIR
CLIP_BUFFER_SECONDS = 5
CLIP_FPS = 15
MAX_FRAME_BUFFER = CLIP_BUFFER_SECONDS * CLIP_FPS


@dataclass
class PipelineResult:
    frame: np.ndarray
    detections: list
    tracked_objects: list
    accident: AccidentEvent | None = None
    fire_alert: FireAlert | None = None
    fps: float = 0.0
    timestamp: float = 0.0


class AIPipeline:
    """Main AI pipeline: detect -> track -> analyze -> report incidents."""

    def __init__(self, on_incident: Callable | None = None):
        self.detector = ObjectDetector()
        self.tracker = ObjectTracker()
        self.accident_detector = AccidentDetector()
        self.fire_detector = FireDetector()
        self.on_incident = on_incident

        self.frame_buffer = deque(maxlen=MAX_FRAME_BUFFER)
        self.lock = threading.Lock()
        self.processing = False
        self.frame_count = 0
        self.fps_counter = deque(maxlen=30)
        self.last_frame_time = 0

        self.camera_lat = settings.CITY_LAT
        self.camera_lon = settings.CITY_LON
        self.camera_name = "Mobile Camera"

    def set_camera_info(self, name: str, lat: float, lon: float):
        self.camera_name = name
        self.camera_lat = lat
        self.camera_lon = lon

    def process_frame(self, frame: np.ndarray) -> PipelineResult | None:
        if frame is None:
            return None

        t0 = time.time()
        self.frame_count += 1

        with self.lock:
            self.frame_buffer.append((frame.copy(), t0))

        detections = self.detector.detect(frame)
        tracked = self.tracker.update(detections)

        accident = self.accident_detector.update(tracked)
        # Fire/smoke detection disabled - only car-to-car collision detection
        fire_alert = None  # self.fire_detector.detect(frame)

        if accident:
            logger.warning(f"🚨 Accident detected in pipeline, handling...")
            self._handle_accident(accident, frame)
        else:
            # Debug: log when no accident detected
            if len([t for t in tracked if t.is_confirmed]) >= 2:
                logger.debug(f"No accident: {len([t for t in tracked if t.is_confirmed])} vehicles tracked but no collision")
        # Fire handling disabled
        # if fire_alert:
        #     self._handle_fire(fire_alert, frame)

        elapsed = time.time() - t0
        self.fps_counter.append(elapsed)
        fps = 1.0 / max(np.mean(self.fps_counter), 0.001)

        return PipelineResult(
            frame=frame,
            detections=detections,
            tracked_objects=tracked,
            accident=accident,
            fire_alert=fire_alert,
            fps=fps,
            timestamp=t0,
        )

    def _handle_accident(self, event: AccidentEvent, current_frame: np.ndarray):
        clip_path, snapshot_path = self._save_evidence("accident", current_frame)
        incident_id = f"ACC-{datetime.now().strftime('%m%d%H%M%S')}-{str(uuid.uuid4())[:4].upper()}"

        # Build description based on car colors
        car1 = getattr(event, "car1_color", "unknown")
        car2 = getattr(event, "car2_color", "unknown")
        title = f"CAR COLLISION: {car1.upper()} + {car2.upper()} Vehicles"

        incident_data = {
            "incident_id": incident_id,
            "category": "accident",
            "title": title,
            "description": event.description,
            "priority": "critical",
            "status": "reported",
            "latitude": self.camera_lat,
            "longitude": self.camera_lon,
            "location_address": f"{self.camera_name} - AI Detected",
            "assigned_department": "emergency_department",
            "ai_risk_score": event.confidence,
            "ai_recommendation": (
                f"AI detected a collision between a {car1} car and a {car2} car. "
                "Dispatch emergency services immediately."
            ),
            "reporter_name": "CRIS AI Pipeline",
            "camera_name": self.camera_name,
            "camera_id": "mobile",
            "snapshot_path": snapshot_path,
            "video_clip_path": clip_path,
            "detection_type": "accident",
            "object_count": 2,  # Two cars involved in collision
            "confidence": event.confidence,
        }
        logger.warning(f"🚨 Sending collision incident to admin: {title}")
        self._notify_incident(incident_data)

    def _handle_fire(self, alert: FireAlert, current_frame: np.ndarray):
        clip_path, snapshot_path = self._save_evidence(alert.alert_type, current_frame)
        prefix = "FIR" if alert.alert_type == "fire" else "SMK"
        incident_id = f"{prefix}-{datetime.now().strftime('%m%d%H%M%S')}-{str(uuid.uuid4())[:4].upper()}"
        priority = "critical" if alert.alert_type == "fire" else "high"

        incident_data = {
            "incident_id": incident_id,
            "category": "fire",
            "title": f"{'Fire' if alert.alert_type == 'fire' else 'Smoke'} Detected - AI Alert",
            "description": f"Automated {alert.alert_type} detection from AI pipeline. Confidence: {alert.confidence:.0%}",
            "priority": priority,
            "status": "reported",
            "latitude": self.camera_lat,
            "longitude": self.camera_lon,
            "location_address": f"{self.camera_name} - AI Detected",
            "assigned_department": "emergency_department",
            "ai_risk_score": alert.confidence,
            "ai_recommendation": f"{'Evacuate area and dispatch fire department.' if alert.alert_type == 'fire' else 'Investigate potential fire hazard.'}",
            "reporter_name": "CRIS AI Pipeline",
            "camera_name": self.camera_name,
            "snapshot_path": snapshot_path,
            "video_clip_path": clip_path,
            "detection_type": alert.alert_type,
            "confidence": alert.confidence,
        }
        self._notify_incident(incident_data)

    def _save_evidence(self, incident_type: str, current_frame: np.ndarray):
        now = datetime.now()
        folder_name = f"{incident_type}_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        evidence_dir = os.path.join(UPLOAD_DIR, folder_name)
        os.makedirs(evidence_dir, exist_ok=True)

        snapshot_path = os.path.join(evidence_dir, "snapshot.jpg")
        cv2.imwrite(snapshot_path, current_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

        clip_path = os.path.join(evidence_dir, "clip.mp4")
        self._save_video_clip(clip_path)

        return clip_path, snapshot_path

    def _save_video_clip(self, output_path: str):
        with self.lock:
            frames = list(self.frame_buffer)

        if not frames:
            return

        h, w = frames[0][0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, CLIP_FPS, (w, h))

        for frame_img, _ in frames:
            resized = cv2.resize(frame_img, (w, h))
            writer.write(resized)
        writer.release()
        logger.info(f"Saved video clip: {output_path} ({len(frames)} frames)")

    def _notify_incident(self, incident_data: dict):
        if self.on_incident:
            try:
                self.on_incident(incident_data)
            except Exception as e:
                logger.error(f"Incident callback error: {e}")

    def reset(self):
        with self.lock:
            self.tracker.reset()
            self.accident_detector.reset()
            self.fire_detector.reset()
            self.frame_buffer.clear()
            self.frame_count = 0
            self.fps_counter.clear()

    def annotate_frame(self, frame: np.ndarray, tracked_objects: list, fps: float) -> np.ndarray:
        annotated = frame.copy()
        class_colors = {
            "person": (0, 255, 0),
            "car": (255, 0, 0),
            "motorcycle": (0, 255, 255),
            "bus": (255, 255, 0),
            "truck": (0, 128, 255),
            "vehicle": (255, 0, 0),
        }

        for obj in tracked_objects:
            if not obj.is_confirmed:
                continue
            x, y, w, h = obj.bbox
            color = class_colors.get(obj.class_name, (255, 255, 255))
            cv2.rectangle(annotated, (x, y), (x + w, y + h), color, 2)
            label = f"{obj.class_name} #{obj.track_id}"
            cv2.putText(annotated, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

            if len(obj.trajectory) > 2:
                pts = np.array(obj.trajectory[-20:], dtype=np.int32)
                cv2.polylines(annotated, [pts], False, color, 1)

        info_text = f"FPS: {fps:.1f} | Objects: {len([o for o in tracked_objects if o.is_confirmed])}"
        cv2.putText(annotated, info_text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        return annotated
