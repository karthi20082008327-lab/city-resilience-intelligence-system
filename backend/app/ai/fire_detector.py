"""
UCRIP Fire/Smoke Detector
Multi-channel fire detection: HSV color analysis + motion + texture.
Not dependent on a single color range - uses multiple fire signatures.
"""

import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np

logger = logging.getLogger(__name__)

FIRE_COOLDOWN = 20
SMOKE_COOLDOWN = 30


@dataclass
class FireAlert:
    alert_type: str  # "fire" or "smoke"
    confidence: float
    bbox: tuple[int, int, int, int]
    timestamp: float


class FireDetector:
    """Detects fire and smoke using HSV color, motion, and contour analysis."""

    def __init__(self):
        self.prev_gray = None
        self.fire_cooldown_until = 0.0
        self.smoke_cooldown_until = 0.0
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        self.large_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))

    def reset(self):
        self.prev_gray = None
        self.fire_cooldown_until = 0.0
        self.smoke_cooldown_until = 0.0

    def detect(self, frame: np.ndarray) -> FireAlert | None:
        now = time.time()

        fire_alert = self._detect_fire(frame, now)
        if fire_alert:
            return fire_alert

        smoke_alert = self._detect_smoke(frame, now)
        if smoke_alert:
            return smoke_alert

        self.prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return None

    def _detect_fire(self, frame, now) -> FireAlert | None:
        if now < self.fire_cooldown_until:
            return None

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        h, w = frame.shape[:2]

        fire_mask1 = cv2.inRange(hsv, np.array([0, 80, 150]), np.array([25, 255, 255]))
        fire_mask2 = cv2.inRange(hsv, np.array([25, 100, 150]), np.array([35, 255, 255]))
        fire_mask3 = cv2.inRange(hsv, np.array([5, 120, 180]), np.array([15, 255, 255]))
        fire_mask = fire_mask1 | fire_mask2 | fire_mask3
        fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_CLOSE, self.kernel)
        fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_OPEN, self.kernel)

        contours, _ = cv2.findContours(fire_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        fire_regions = []
        for c in contours:
            area = cv2.contourArea(c)
            if area > 300:
                solidity = area / max(cv2.contourArea(cv2.convexHull(c)), 1)
                if solidity > 0.3:
                    fire_regions.append((c, area))

        if not fire_regions:
            return None

        total_fire_area = sum(a for _, a in fire_regions)
        total_frame_area = h * w
        fire_ratio = total_fire_area / total_frame_area

        motion_score = 0
        if self.prev_gray is not None:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            diff = cv2.absdiff(self.prev_gray, gray)
            _, motion_mask = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
            motion_mask = cv2.morphologyEx(motion_mask, cv2.MORPH_CLOSE, self.large_kernel)
            fire_region_motion = cv2.bitwise_and(motion_mask, fire_mask)
            fire_motion_area = cv2.countNonZero(fire_region_motion)
            motion_score = min(fire_motion_area / max(total_fire_area, 1), 1.0)
            self.prev_gray = gray

        brightness = cv2.mean(hsv[:, :, 2], mask=fire_mask)[0] / 255.0

        flicker_score = self._detect_flicker(fire_mask)

        fire_confidence = min(
            0.3 * min(fire_ratio * 8, 1.0) + 0.25 * motion_score + 0.25 * brightness + 0.2 * flicker_score, 0.99
        )

        if fire_confidence > 0.55 and fire_ratio > 0.003:
            all_points = np.vstack([c for c, _ in fire_regions])
            x, y, bw, bh = cv2.boundingRect(all_points)
            self.fire_cooldown_until = now + FIRE_COOLDOWN
            logger.warning(f"FIRE DETECTED: confidence={fire_confidence:.2f}, ratio={fire_ratio:.4f}")
            return FireAlert(
                alert_type="fire",
                confidence=fire_confidence,
                bbox=(int(x), int(y), int(bw), int(bh)),
                timestamp=now,
            )
        return None

    def _detect_smoke(self, frame, now) -> FireAlert | None:
        if now < self.smoke_cooldown_until:
            return None

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        h, w = frame.shape[:2]

        smoke_mask1 = cv2.inRange(hsv, np.array([0, 0, 120]), np.array([180, 40, 220]))
        smoke_mask2 = cv2.inRange(hsv, np.array([90, 0, 100]), np.array([130, 50, 200]))
        smoke_mask = smoke_mask1 | smoke_mask2
        smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_CLOSE, self.large_kernel)
        smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_OPEN, self.kernel)

        contours, _ = cv2.findContours(smoke_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        smoke_regions = [(c, cv2.contourArea(c)) for c in contours if cv2.contourArea(c) > 600]

        if not smoke_regions:
            return None

        total_smoke_area = sum(a for _, a in smoke_regions)
        smoke_ratio = total_smoke_area / (h * w)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        smoke_confidence = 0.0

        if self.prev_gray is not None:
            diff = cv2.absdiff(self.prev_gray, gray)
            blur_diff = cv2.GaussianBlur(diff, (15, 15), 0)
            smoke_motion = cv2.countNonZero(blur_diff)
            motion_ratio = smoke_motion / (h * w)
            if 0.005 < motion_ratio < 0.15:
                smoke_confidence += 0.4

        blur = cv2.Laplacian(gray, cv2.CV_64F)
        blur_score = 1.0 - min(abs(blur.mean()) / 50, 1.0)
        smoke_confidence += blur_score * 0.3
        smoke_confidence += min(smoke_ratio * 5, 1.0) * 0.3
        smoke_confidence = min(smoke_confidence, 0.99)

        if smoke_confidence > 0.5 and smoke_ratio > 0.01:
            all_points = np.vstack([c for c, _ in smoke_regions])
            x, y, bw, bh = cv2.boundingRect(all_points)
            self.smoke_cooldown_until = now + SMOKE_COOLDOWN
            logger.warning(f"SMOKE DETECTED: confidence={smoke_confidence:.2f}")
            return FireAlert(
                alert_type="smoke",
                confidence=smoke_confidence,
                bbox=(int(x), int(y), int(bw), int(bh)),
                timestamp=now,
            )
        self.prev_gray = gray
        return None

    def _detect_flicker(self, mask, threshold=0.15):
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return 0.0
        areas = [cv2.contourArea(c) for c in contours if cv2.contourArea(c) > 100]
        if len(areas) < 2:
            return 0.0
        mean_area = np.mean(areas)
        std_area = np.std(areas)
        flicker = std_area / max(mean_area, 1)
        return min(flicker, 1.0)
