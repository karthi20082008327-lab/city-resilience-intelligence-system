"""
CRIS Object Tracker
Kalman-filter based multi-object tracker (ByteTrack-inspired).
Assigns persistent IDs and tracks velocity/trajectory for each object.
"""

import logging
import math
from dataclasses import dataclass, field

import numpy as np
from filterpy.kalman import KalmanFilter
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger(__name__)

MAX_AGE = 30
MIN_HITS = 2  # Confirm after 2 frames (faster than 3, still filters single-frame noise)
IOU_THRESHOLD = 0.3


def iou_batch(bb_test, bb_gt):
    bb_gt = np.expand_dims(bb_gt, 0)
    bb_test = np.expand_dims(bb_test, 1)

    xx1 = np.maximum(bb_test[:, :, 0], bb_gt[:, :, 0])
    yy1 = np.maximum(bb_test[:, :, 1], bb_gt[:, :, 1])
    xx2 = np.minimum(bb_test[:, :, 0] + bb_test[:, :, 2], bb_gt[:, :, 0] + bb_gt[:, :, 2])
    yy2 = np.minimum(bb_test[:, :, 1] + bb_test[:, :, 3], bb_gt[:, :, 1] + bb_gt[:, :, 3])
    w = np.maximum(0.0, xx2 - xx1)
    h = np.maximum(0.0, yy2 - yy1)
    inter = w * h
    area_test = bb_test[:, :, 2] * bb_test[:, :, 3]
    area_gt = bb_gt[:, :, 2] * bb_gt[:, :, 3]
    union = area_test + area_gt - inter
    return inter / np.maximum(union, 1e-6)


def linear_assignment(cost_matrix):
    if cost_matrix.size == 0:
        return np.array([]), np.array([]), np.array([])
    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    return row_ind, col_ind, cost_matrix[row_ind, col_ind]


@dataclass
class TrackedObject:
    track_id: int
    class_name: str
    bbox: tuple[int, int, int, int]
    center: tuple[int, int]
    confidence: float
    age: int = 0
    hits: int = 1
    time_since_update: int = 0
    velocity: tuple[float, float] = (0.0, 0.0)
    trajectory: list = field(default_factory=list)
    is_confirmed: bool = False
    dominant_color: str = "unknown"
    kf: KalmanFilter | None = field(default=None, repr=False)

    def __post_init__(self):
        self.trajectory.append(self.center)


class KalmanBoxTracker:
    _id_counter = 0

    def __init__(self, bbox, class_name, confidence, dominant_color="unknown"):
        KalmanBoxTracker._id_counter += 1
        self.track_id = KalmanBoxTracker._id_counter
        self.class_name = class_name
        self.confidence = confidence
        self.dominant_color = dominant_color

        self.kf = KalmanFilter(dim_x=7, dim_z=4)
        self.kf.F = np.array(
            [
                [1, 0, 0, 0, 1, 0, 0],
                [0, 1, 0, 0, 0, 1, 0],
                [0, 0, 1, 0, 0, 0, 1],
                [0, 0, 0, 1, 0, 0, 0],
                [0, 0, 0, 0, 1, 0, 0],
                [0, 0, 0, 0, 0, 1, 0],
                [0, 0, 0, 0, 0, 0, 1],
            ]
        )
        self.kf.H = np.array(
            [
                [1, 0, 0, 0, 0, 0, 0],
                [0, 1, 0, 0, 0, 0, 0],
                [0, 0, 1, 0, 0, 0, 0],
                [0, 0, 0, 1, 0, 0, 0],
            ]
        )
        self.kf.R *= 10.0
        self.kf.P[4:, 4:] *= 1000.0
        self.kf.P *= 10.0
        self.kf.Q[-1, -1] *= 0.01
        self.kf.Q[4:, 4:] *= 0.01

        x, y, w, h = bbox
        cx, cy = x + w / 2, y + h / 2
        self.kf.x[:4] = np.array([cx, cy, w, h]).reshape((4, 1))

        self.age = 0
        self.hits = 1
        self.time_since_update = 0
        self.history = []
        self.velocity = (0.0, 0.0)
        self.last_center = (int(cx), int(cy))
        self.trajectory = [(int(cx), int(cy))]

    def predict(self):
        self.kf.predict()
        self.age += 1
        self.time_since_update += 1
        return self.get_state()

    def update(self, bbox, confidence):
        x, y, w, h = bbox
        cx, cy = x + w / 2, y + h / 2
        measurement = np.array([cx, cy, w, h]).reshape((4, 1))
        self.kf.update(measurement)
        self.hits += 1
        self.time_since_update = 0
        self.confidence = confidence

        self.last_center = (int(cx), int(cy))
        if self.trajectory:
            prev = self.trajectory[-1]
            self.velocity = (self.last_center[0] - prev[0], self.last_center[1] - prev[1])
        self.trajectory.append(self.last_center)
        if len(self.trajectory) > 60:
            self.trajectory = self.trajectory[-60:]

    def get_state(self):
        return self.kf.x[:4].flatten()

    def get_tracked(self):
        state = self.get_state()
        cx, cy, w, h = state
        x, y = int(cx - w / 2), int(cy - h / 2)
        return TrackedObject(
            track_id=self.track_id,
            class_name=self.class_name,
            bbox=tuple(map(int, self.get_state())),
            center=self.last_center,
            confidence=self.confidence,
            age=self.age,
            hits=self.hits,
            time_since_update=self.time_since_update,
            velocity=self.velocity,
            trajectory=list(self.trajectory[-30:]),
            is_confirmed=(self.hits >= MIN_HITS),
            dominant_color=self.dominant_color,
            kf=self.kf,
        )


class ObjectTracker:
    """Multi-object tracker using Kalman filters + Hungarian assignment."""

    def __init__(self):
        self.trackers: list[KalmanBoxTracker] = []
        self.frame_count = 0
        self._id_counter = 0

    def update(self, detections) -> list[TrackedObject]:
        self.frame_count += 1
        if not detections:
            for t in self.trackers:
                t.predict()
            self.trackers = [t for t in self.trackers if t.time_since_update <= MAX_AGE]
            return self._get_confirmed()

        bbox_list = np.array([d.bbox for d in detections], dtype=np.float32)
        {i: d.class_name for i, d in enumerate(detections)}
        {i: d.confidence for i, d in enumerate(detections)}

        for t in self.trackers:
            t.predict()

        if self.trackers:
            tracker_bboxes = np.array([t.get_state() for t in self.trackers], dtype=np.float32)
            iou_matrix = iou_batch(bbox_list, tracker_bboxes)
            cost_matrix = 1 - iou_matrix
            matched_indices, unmatched_dets, unmatched_trks = self._match(cost_matrix)
        else:
            matched_indices = np.array([]).reshape(0, 2)
            unmatched_dets = list(range(len(detections)))
            unmatched_trks = list(range(len(self.trackers)))

        # Second match stage: center-distance fallback so tracks survive sudden
        # stops/velocity changes where Kalman prediction glides away (IoU fails).
        if unmatched_dets and unmatched_trks:
            dist_indices, unmatched_dets, unmatched_trks = self._match_by_distance(
                detections, unmatched_dets, unmatched_trks
            )
            if len(dist_indices) > 0:
                matched_indices = np.vstack([matched_indices, dist_indices]) if matched_indices.size else dist_indices

        matched_dets = set()
        for m in matched_indices:
            det_idx, trk_idx = int(m[0]), int(m[1])
            self.trackers[trk_idx].update(detections[det_idx].bbox, detections[det_idx].confidence)
            matched_dets.add(det_idx)

        for det_idx in unmatched_dets:
            d = detections[det_idx]
            tracker = KalmanBoxTracker(
                d.bbox,
                d.class_name,
                d.confidence,
                getattr(d, "dominant_color", "unknown"),
            )
            self.trackers.append(tracker)

        self.trackers = [t for t in self.trackers if t.time_since_update <= MAX_AGE]
        return self._get_confirmed()

    def _match_by_distance(self, detections, unmatched_dets, unmatched_trks, max_dist=60):
        """Fallback matching: assign remaining detections to tracks by center distance.

        Handles the case where an object abruptly stops and the Kalman prediction
        glides away, dropping IoU below threshold.
        """
        matched = set()
        remaining_dets = list(unmatched_dets)
        remaining_trks = list(unmatched_trks)

        for det_idx in remaining_dets:
            dcx, dcy = detections[det_idx].center
            best_trk, best_dist = None, max_dist
            for trk_idx in remaining_trks:
                t = self.trackers[trk_idx]
                tcx, tcy = t.last_center
                dist = math.hypot(dcx - tcx, dcy - tcy)
                if dist < best_dist:
                    best_dist = dist
                    best_trk = trk_idx
            if best_trk is not None:
                matched.add((det_idx, best_trk))
                remaining_trks.remove(best_trk)

        for det_idx, trk_idx in list(matched):
            if det_idx in remaining_dets:
                remaining_dets.remove(det_idx)

        return np.array(list(matched)) if matched else np.array([]).reshape(0, 2), remaining_dets, remaining_trks

    def _match(self, cost_matrix):
        row_indices, col_indices, costs = linear_assignment(cost_matrix)
        matched = set()
        unmatched_dets = list(range(cost_matrix.shape[0]))
        unmatched_trks = list(range(cost_matrix.shape[1]))

        if len(row_indices) > 0:
            for r, c in zip(row_indices, col_indices):
                if cost_matrix[r, c] > (1 - IOU_THRESHOLD):
                    continue
                matched.add((r, c))
                if r in unmatched_dets:
                    unmatched_dets.remove(r)
                if c in unmatched_trks:
                    unmatched_trks.remove(c)

        return np.array(list(matched)) if matched else np.array([]).reshape(0, 2), unmatched_dets, unmatched_trks

    def _get_confirmed(self):
        return [t.get_tracked() for t in self.trackers if t.hits >= MIN_HITS]

    def reset(self):
        self.trackers.clear()
        self.frame_count = 0
