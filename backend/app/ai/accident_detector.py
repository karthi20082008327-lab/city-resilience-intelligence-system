"""
CRIS Accident Detector — Fast Collision Detection for Toy Cars
Detects when two car bounding boxes touch or overlap.
Triggers instantly when a red car and black car collide.
"""

import logging
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Very tight threshold — detects when bounding boxes are touching or overlapping
OVERLAP_THRESHOLD = 15  # pixels — if gap < this, it's a collision
COOLDOWN_SECONDS = 3   # Very fast reset — detect repeated collisions in 3 seconds
VEHICLE_CLASSES = {"car", "vehicle"}


def bbox_touches(box1, box2, threshold=OVERLAP_THRESHOLD) -> bool:
    """Check if two bounding boxes touch or overlap.
    box = (x, y, w, h)
    Returns True if the gap between them is less than threshold.
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2

    # Edges of each box
    left1, right1 = x1, x1 + w1
    top1, bottom1 = y1, y1 + h1
    left2, right2 = x2, x2 + w2
    top2, bottom2 = y2, y2 + h2

    # Check for overlap (boxes intersect)
    if left1 < right2 and right1 > left2 and top1 < bottom2 and bottom1 > top2:
        return True

    # Check for touching (gap < threshold)
    gap_x = max(0, max(left1, left2) - min(right1, right2))
    gap_y = max(0, max(top1, top2) - min(bottom1, bottom2))

    return gap_x <= threshold and gap_y <= threshold


@dataclass
class AccidentEvent:
    track_ids: tuple[int, ...]
    timestamp: float
    confidence: float
    position: tuple[int, int]
    description: str
    car1_color: str = "unknown"
    car2_color: str = "unknown"


class AccidentDetector:
    """Fast collision detector. Triggers when two cars touch or overlap."""

    def __init__(self):
        self.cooldown_until: float = 0
        self.last_trigger_time: float = 0

    def reset(self):
        self.cooldown_until = 0
        self.last_trigger_time = 0

    def update(self, tracked_objects) -> AccidentEvent | None:
        now = time.time()
        if now < self.cooldown_until:
            return None

        # Get all confirmed cars (also accept generic "vehicle" class)
        cars = [
            t for t in tracked_objects
            if t.class_name in VEHICLE_CLASSES and t.is_confirmed
            and t.confidence >= 0.5  # Minimum confidence to avoid fakes
        ]

        # Debug logging
        all_classes = [f"{t.class_name}(conf={t.confidence:.2f}, confirmed={t.is_confirmed})" for t in tracked_objects]
        car_info = [f"#{c.track_id} {c.class_name} bbox={c.bbox} color={c.dominant_color}" for c in cars]
        logger.warning(f"🔍 ACCIDENT CHECK: {len(tracked_objects)} tracked objects: {all_classes[:5]}")
        logger.warning(f"🔍 Confirmed cars: {len(cars)} — {car_info[:5]}")

        if len(cars) < 2:
            logger.debug(f"Need 2+ cars, found {len(cars)}")
            return None

        # Check every pair of cars for touching/overlap
        for i in range(len(cars)):
            for j in range(i + 1, len(cars)):
                c1, c2 = cars[i], cars[j]

                # Both must be cars
                if c1.class_name not in {"car"} and c2.class_name not in {"car"}:
                    # Accept if at least one is a car
                    if c1.class_name != "car" and c2.class_name != "car":
                        continue

                # Check if bounding boxes touch or overlap
                if not bbox_touches(c1.bbox, c2.bbox):
                    continue

                # Filter: both boxes must be reasonable size for toy cars
                min_size = 25  # minimum 25 pixels in each dimension
                max_size = 400  # maximum 400 pixels (not a building)
                for car in [c1, c2]:
                    bw, bh = car.bbox[2], car.bbox[3]
                    if bw < min_size or bh < min_size:
                        continue
                    if bw > max_size or bh > max_size:
                        continue

                # Check colors — must be red and black
                colors = {c1.dominant_color, c2.dominant_color}
                is_red_black = "red" in colors and "black" in colors

                if not is_red_black:
                    # Still trigger for any two cars touching, but mark as lower confidence
                    confidence = 0.7
                    color_desc = f"{c1.dominant_color} + {c2.dominant_color}"
                else:
                    confidence = 0.95
                    color_desc = "RED + BLACK"

                # Calculate collision midpoint
                cx = (c1.center[0] + c2.center[0]) // 2
                cy = (c1.center[1] + c2.center[1]) // 2

                event = AccidentEvent(
                    track_ids=(c1.track_id, c2.track_id),
                    timestamp=now,
                    confidence=confidence,
                    position=(cx, cy),
                    description=(
                        f"COLLISION: Car #{c1.track_id} ({c1.dominant_color}) "
                        f"touched Car #{c2.track_id} ({c2.dominant_color}) "
                        f"at ({cx}, {cy}). Bounding boxes overlapping."
                    ),
                    car1_color=c1.dominant_color,
                    car2_color=c2.dominant_color,
                )

                logger.warning(f"🚨 COLLISION DETECTED: {color_desc} — {event.description}")

                # Set cooldown
                self.cooldown_until = now + COOLDOWN_SECONDS
                self.last_trigger_time = now
                return event

        return None
