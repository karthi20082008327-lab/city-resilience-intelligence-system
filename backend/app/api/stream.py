"""
UCRIP Video Stream Endpoint
WebSocket endpoint for receiving live video frames from mobile CCTV.
Processes frames through AI pipeline in a thread pool to avoid blocking.
"""

import asyncio
import base64
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from app.ai.pipeline import AIPipeline
from app.core.deps import get_optional_user
from app.core.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI Stream"])

UPLOAD_DIR = settings.UPLOAD_DIR

pipeline: AIPipeline | None = None
executor = ThreadPoolExecutor(max_workers=2)


async def _on_incident(data: dict):
    from app.services.incident_service import IncidentService

    await IncidentService.create_incident(data)


def get_pipeline() -> AIPipeline:
    global pipeline
    if pipeline is None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        def _notify(data: dict):
            if loop is None:
                return
            asyncio.run_coroutine_threadsafe(_on_incident(data), loop)

        pipeline = AIPipeline(on_incident=_notify)
        logger.info("AI Pipeline initialized")
    return pipeline


def process_in_thread(pipe, frame):
    return pipe.process_frame(frame)


@router.websocket("/ws/stream")
async def video_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("[STREAM] Mobile client connected")

    pipe = get_pipeline()
    frame_count = 0
    last_status_time = time.time()
    processing = False

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)

                if msg.get("type") == "config":
                    pipe.set_camera_info(
                        name=msg.get("camera_name", "Mobile Camera"),
                        lat=msg.get("latitude", settings.CITY_LAT),
                        lon=msg.get("longitude", settings.CITY_LON),
                    )
                    await websocket.send_text(json.dumps({"type": "config_ack", "status": "ok"}))
                    continue

                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                if msg.get("type") == "frame":
                    if processing:
                        continue

                    frame_b64 = msg.get("data")
                    if not frame_b64:
                        continue

                    img_bytes = base64.b64decode(frame_b64)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    if frame is None:
                        continue

                    processing = True
                    try:
                        result = await asyncio.get_event_loop().run_in_executor(
                            executor, process_in_thread, pipe, frame
                        )
                    finally:
                        processing = False

                    if result is None:
                        continue

                    frame_count += 1
                    now = time.time()

                    if now - last_status_time >= 2.0:
                        confirmed = [t for t in result.tracked_objects if t.is_confirmed]
                        response = {
                            "type": "status",
                            "fps": round(result.fps, 1),
                            "objects": len(confirmed),
                            "tracked": [
                                {
                                    "id": t.track_id,
                                    "class": t.class_name,
                                    "bbox": list(t.bbox),
                                    "confidence": round(t.confidence, 2),
                                }
                                for t in confirmed[:20]
                            ],
                        }

                        if result.accident:
                            annotated = pipe.annotate_frame(frame, result.tracked_objects, result.fps)
                            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 50])
                            response["annotated_frame"] = base64.b64encode(buf).decode("utf-8")
                            response["alert"] = {
                                "type": "accident",
                                "confidence": result.accident.confidence,
                                "description": result.accident.description,
                            }
                        elif result.fire_alert:
                            annotated = pipe.annotate_frame(frame, result.tracked_objects, result.fps)
                            _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 50])
                            response["annotated_frame"] = base64.b64encode(buf).decode("utf-8")
                            response["alert"] = {
                                "type": result.fire_alert.alert_type,
                                "confidence": result.fire_alert.confidence,
                            }

                        await websocket.send_text(json.dumps(response))
                        last_status_time = now

            except json.JSONDecodeError:
                pass
            except Exception as e:
                logger.error(f"Frame processing error: {e}")
                processing = False

    except WebSocketDisconnect:
        logger.info("[STREAM] Mobile client disconnected")
    except Exception as e:
        logger.error(f"[STREAM] Error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.post("/api/stream/config")
async def configure_stream(
    camera_name: str = "Mobile Camera",
    lat: float = settings.CITY_LAT,
    lon: float = settings.CITY_LON,
    current_user=Depends(get_optional_user),
):
    pipe = get_pipeline()
    pipe.set_camera_info(camera_name, lat, lon)
    return {"status": "ok", "camera": camera_name, "lat": lat, "lon": lon}


@router.post("/api/stream/verify")
async def verify_stream_frame(payload: dict, current_user=Depends(get_optional_user)):
    """Verify a CCTV frame (from mobile camera / simulation) and report an incident.

    Accepts a base64-encoded frame plus optional metadata. Saves the frame as
    snapshot evidence and creates an incident for the admin dashboard.
    """
    import uuid
    from datetime import datetime

    from app.services.incident_service import IncidentService

    frame_b64 = payload.get("image") or payload.get("frame")
    if not frame_b64:
        raise HTTPException(status_code=400, detail="Missing image frame")

    camera_name = payload.get("camera_name", "Mobile Camera")
    camera_id = payload.get("camera_id")
    latitude = payload.get("latitude", settings.CITY_LAT)
    longitude = payload.get("longitude", settings.CITY_LON)
    confidence = float(payload.get("confidence", 0.9))

    category = payload.get("category", "accident")
    title = payload.get("title") or "Vehicle Collision - CCTV Verified"
    description = payload.get("description") or "Incident detected and verified via CCTV camera feed."
    detection_type = payload.get("detection_type", category)
    priority = payload.get("priority")
    assigned_department = payload.get("assigned_department")
    ai_recommendation = payload.get("ai_recommendation")
    object_count = int(payload.get("object_count", 0))

    img_bytes = base64.b64decode(frame_b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image data")

    # Save snapshot evidence
    now = datetime.now()
    folder_name = f"{category}_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    evidence_dir = os.path.join(UPLOAD_DIR, folder_name)
    os.makedirs(evidence_dir, exist_ok=True)
    snapshot_path = os.path.join(evidence_dir, "snapshot.jpg")
    cv2.imwrite(snapshot_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

    incident_id = f"ACC-{now.strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:4].upper()}"

    if not priority:
        critical_categories = ["fire", "gas_leak", "building_collapse", "flood"]
        high_categories = ["accident", "power_outage"]
        priority = (
            "critical" if category in critical_categories else ("high" if category in high_categories else "medium")
        )

    if not assigned_department:
        dept_map = {
            "accident": "emergency_department",
            "water_leak": "water_department",
            "fire": "emergency_department",
            "power_outage": "electricity_department",
            "road_damage": "traffic_department",
            "flood": "disaster_management",
            "gas_leak": "emergency_department",
            "building_collapse": "disaster_management",
            "other": "emergency_department",
        }
        assigned_department = dept_map.get(category, "emergency_department")

    if not ai_recommendation:
        ai_recommendation = (
            "Automated CCTV detection. Immediate response required. Dispatch relevant department to the location."
        )

    incident_data = {
        "incident_id": incident_id,
        "category": category,
        "title": title,
        "description": description,
        "priority": priority,
        "status": "reported",
        "latitude": latitude,
        "longitude": longitude,
        "location_address": f"{camera_name} - CCTV Verified",
        "assigned_department": assigned_department,
        "ai_risk_score": confidence,
        "ai_recommendation": ai_recommendation,
        "reporter_name": "UCRIP CCTV Verification",
        "camera_name": camera_name,
        "snapshot_path": snapshot_path,
        "detection_type": detection_type,
        "confidence": confidence,
        "object_count": object_count,
    }

    incident = await IncidentService.create_incident(incident_data)

    return {
        "verified": incident is not None,
        "incident_id": incident.incident_id if incident else incident_id,
        "snapshot_url": f"/uploads/{folder_name}/snapshot.jpg",
        "camera_name": camera_name,
        "camera_id": camera_id,
        "category": category,
        "confidence": confidence,
    }


@router.get("/api/stream/status")
async def stream_status(current_user=Depends(get_optional_user)):
    return {"pipeline_active": pipeline is not None, "status": "ready"}
