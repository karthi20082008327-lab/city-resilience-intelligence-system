"""
UCRIP Accident Detector
Analyzes tracked object trajectories to detect vehicle collisions.
Logic: Two vehicles in close proximity + sudden velocity change = possible accident.
"""

import logging
import math
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

PROXIMITY_THRESHOLD = 80
VELOCITY_DROP_RATIO = 0.6
MIN_TRACK_FRAMES = 5
COOLDOWN_SECONDS = 30
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck"}


@dataclass
class AccidentEvent:
    track_ids: tuple[int, ...]
    timestamp: float
    confidence: float
    position: tuple[int, int]
    description: str


class AccidentDetector:
    """Detects accidents by analyzing velocity changes and proximity of tracked vehicles."""

    def __init__(self):
        self.prev_states: dict[int, dict] = {}
        self.cooldown_until: float = 0
        self.active_accidents: dict[tuple[int, int], float] = {}
        self.incident_ids: set = set()

    def reset(self):
        self.prev_states.clear()
        self.cooldown_until = 0
        self.active_accidents.clear()
        self.incident_ids.clear()

    def update(self, tracked_objects) -> AccidentEvent | None:
        now = time.time()
        if now < self.cooldown_until:
            return None

        vehicles = [t for t in tracked_objects if t.class_name in VEHICLE_CLASSES and t.is_confirmed]
        if len(vehicles) < 2:
            logger.debug(f"Accident check: only {len(vehicles)} confirmed vehicles")
            self._update_states(vehicles)
            return None

        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                v1, v2 = vehicles[i], vehicles[j]
                dist = self._distance(v1.center, v2.center)

                if dist < PROXIMITY_THRESHOLD:
                    event = self._check_collision(v1, v2, now, dist)
                    if event:
                        pair_key = (min(v1.track_id, v2.track_id), max(v1.track_id, v2.track_id))
                        if (
                            pair_key not in self.active_accidents
                            or (now - self.active_accidents[pair_key]) > COOLDOWN_SECONDS
                        ):
                            self.active_accidents[pair_key] = now
                            self.cooldown_until = now + COOLDOWN_SECONDS
                            self._update_states(vehicles)
                            return event

        self._cleanup_active(now)
        self._update_states(vehicles)
        return None

    def _check_collision(self, v1, v2, now, dist) -> AccidentEvent | None:
        prev1 = self.prev_states.get(v1.track_id)
        prev2 = self.prev_states.get(v2.track_id)

        if not prev1 or not prev2:
            return None
        if v1.age < MIN_TRACK_FRAMES or v2.age < MIN_TRACK_FRAMES:
            return None

        speed1 = math.sqrt(v1.velocity[0] ** 2 + v1.velocity[1] ** 2)
        speed2 = math.sqrt(v2.velocity[0] ** 2 + v2.velocity[1] ** 2)
        prev_speed1 = prev1.get("speed", 0)
        prev_speed2 = prev2.get("speed", 0)

        decel1 = (prev_speed1 - speed1) / max(prev_speed1, 1) if prev_speed1 > 0 else 0
        decel2 = (prev_speed2 - speed2) / max(prev_speed2, 1) if prev_speed2 > 0 else 0

        stopped = (speed1 < 2 and speed2 < 2) or (decel1 > VELOCITY_DROP_RATIO and decel2 > VELOCITY_DROP_RATIO)
        was_moving = prev_speed1 > 3 and prev_speed2 > 3
        converged = self._trajectory_converge(v1.trajectory, v2.trajectory)

        if stopped and (was_moving or converged):
            confidence = self._calc_confidence(dist, decel1, decel2, was_moving, converged)
            if confidence > 0.5:
                mid_x = (v1.center[0] + v2.center[0]) // 2
                mid_y = (v1.center[1] + v2.center[1]) // 2
                logger.warning(
                    f"ACCIDENT DETECTED: {v1.class_name}#{v1.track_id} + {v2.class_name}#{v2.track_id} "
                    f"confidence={confidence:.2f} pos=({mid_x},{mid_y})"
                )
                return AccidentEvent(
                    track_ids=(v1.track_id, v2.track_id),
                    timestamp=now,
                    confidence=confidence,
                    position=(mid_x, mid_y),
                    description=(
                        f"Possible collision between {v1.class_name} and {v2.class_name}. "
                        f"Sudden stop detected with {confidence:.0%} confidence."
                    ),
                )
        return None

    def _calc_confidence(self, dist, decel1, decel2, was_moving, converged):
        c = 0.5
        if dist < 40:
            c += 0.2
        elif dist < 60:
            c += 0.1
        if was_moving:
            c += 0.15
        if converged:
            c += 0.1
        c += min(decel1, decel2) * 0.1
        return min(c, 0.99)

    def _trajectory_converge(self, traj1, traj2, lookback=10):
        if len(traj1) < lookback or len(traj2) < lookback:
            return False
        recent1 = traj1[-lookback:]
        recent2 = traj2[-lookback:]
        dists = [self._distance(p1, p2) for p1, p2 in zip(recent1, recent2)]
        if len(dists) < 2:
            return False
        return dists[-1] < dists[0] * 0.5

    def _update_states(self, vehicles):
        for v in vehicles:
            speed = math.sqrt(v.velocity[0] ** 2 + v.velocity[1] ** 2)
            self.prev_states[v.track_id] = {
                "speed": speed,
                "center": v.center,
                "velocity": v.velocity,
                "time": time.time(),
            }

    def _cleanup_active(self, now):
        expired = [k for k, t in self.active_accidents.items() if now - t > COOLDOWN_SECONDS]
        for k in expired:
            del self.active_accidents[k]

    @staticmethod
    def _distance(p1, p2):
        return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)
