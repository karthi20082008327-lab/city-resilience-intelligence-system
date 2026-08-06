import uuid
import os
import asyncio
import cv2
import numpy as np
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.incident import Incident, IncidentMedia
from app.schemas.incident import IncidentResponse, IncidentMediaResponse
from app.api.websocket import manager
from app.core.settings import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/collision", tags=["Collision Detection"])

vehicle_cascade = None
for cascade_path in [
    cv2.data.haarcascades + 'haarcascade_car.xml',
]:
    if os.path.exists(cascade_path):
        vehicle_cascade = cv2.CascadeClassifier(cascade_path)
        break


def detect_fire(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    fire_mask1 = cv2.inRange(hsv, np.array([0, 80, 150]), np.array([25, 255, 255]))
    fire_mask2 = cv2.inRange(hsv, np.array([25, 80, 150]), np.array([35, 255, 255]))
    fire_mask3 = cv2.inRange(hsv, np.array([0, 100, 200]), np.array([15, 255, 255]))
    fire_mask = fire_mask1 | fire_mask2 | fire_mask3

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_CLOSE, kernel)
    fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(fire_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = img.shape[:2]
    total_area = h * w

    fire_regions = []
    fire_total_area = 0
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > 500:
            x, y, bw, bh = cv2.boundingRect(contour)
            fire_total_area += area
            fire_regions.append({"x": int(x), "y": int(y), "width": int(bw), "height": int(bh), "area": int(area)})

    fire_ratio = fire_total_area / total_area
    fire_score = min(fire_ratio * 10, 1.0)

    if fire_ratio > 0.005 and len(fire_regions) > 0:
        fire_regions.sort(key=lambda r: r["area"], reverse=True)
        merged = fire_regions[0]
        for r in fire_regions[1:5]:
            mx = min(merged["x"], r["x"])
            my = min(merged["y"], r["y"])
            merged = {
                "x": mx, "y": my,
                "width": max(merged["x"] + merged["width"], r["x"] + r["width"]) - mx,
                "height": max(merged["y"] + merged["height"], r["y"] + r["height"]) - my,
                "area": merged["area"] + r["area"],
            }
        return True, fire_score, merged

    return False, fire_score, None


def detect_smoke(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    smoke_mask = cv2.inRange(hsv, np.array([0, 0, 100]), np.array([180, 50, 220]))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_CLOSE, kernel)
    smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(smoke_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    smoke_area = sum(cv2.contourArea(c) for c in contours if cv2.contourArea(c) > 800)
    h, w = img.shape[:2]
    smoke_ratio = smoke_area / (h * w)
    return smoke_ratio > 0.02, min(smoke_ratio * 5, 1.0)


def run_detection(contents: bytes) -> dict:
    """Blocking CV detection - must run off the event loop."""
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"detections": [], "alerts": []}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = img.shape[:2]
    detections = []
    alerts = []

    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    try:
        boxes, weights = hog.detectMultiScale(gray, winStride=(8, 8), padding=(4, 4), scale=1.05)
        for (x, y, bw, bh), weight in zip(boxes, weights):
            detections.append({
                "class": "person", "score": float(min(weight / 1.5, 1.0)),
                "bbox": {"x": int(x), "y": int(y), "width": int(bw), "height": int(bh)},
            })
    except Exception:
        pass

    if vehicle_cascade is not None:
        try:
            vehicles = vehicle_cascade.detectMultiScale(gray, 1.1, 3, 0, (30, 30))
            for (x, y, bw, bh) in vehicles:
                detections.append({
                    "class": "vehicle", "score": 0.85,
                    "bbox": {"x": int(x), "y": int(y), "width": int(bw), "height": int(bh)},
                })
        except Exception:
            pass

    fire_detected, fire_score, fire_bbox = detect_fire(img)
    if fire_detected:
        detections.append({
            "class": "fire", "score": fire_score,
            "bbox": fire_bbox or {"x": 0, "y": 0, "width": w, "height": h},
        })
        alerts.append({
            "type": "fire", "severity": "critical" if fire_score > 0.5 else "high",
            "confidence": fire_score,
            "message": "Fire detected in camera feed",
        })

    smoke_detected, smoke_score = detect_smoke(img)
    if smoke_detected:
        detections.append({
            "class": "smoke", "score": smoke_score,
            "bbox": {"x": 0, "y": 0, "width": w, "height": int(h * 0.5)},
        })
        alerts.append({
            "type": "smoke", "severity": "high",
            "confidence": smoke_score,
            "message": "Smoke detected in camera feed",
        })

    vehicle_count = sum(1 for d in detections if d["class"] == "vehicle")
    people_count = sum(1 for d in detections if d["class"] == "person")

    return {
        "detections": detections,
        "alerts": alerts,
        "vehicle_count": vehicle_count,
        "people_count": people_count,
        "fire_detected": fire_detected,
        "smoke_detected": smoke_detected,
        "image_width": w,
        "image_height": h,
    }


@router.post("/detect")
async def detect_objects(frame: UploadFile = File(...)):
    contents = await frame.read()
    return await asyncio.get_running_loop().run_in_executor(None, run_detection, contents)


@router.post("/report")
async def report_incident(
    screenshot: UploadFile = File(...),
    latitude: float = Form(default=settings.CITY_LAT),
    longitude: float = Form(default=settings.CITY_LON),
    incident_type: str = Form(default="accident"),
    vehicle_count: int = Form(default=0),
    people_count: int = Form(default=0),
    fire_confidence: float = Form(default=0.0),
    smoke_confidence: float = Form(default=0.0),
    confidence: float = Form(default=0.0),
    location_address: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%m%d%H%M%S")
    random_suffix = str(uuid.uuid4())[:4].upper()

    if incident_type == "fire":
        incident_id = f"FIR-{timestamp}-{random_suffix}"
        category = "fire"
        priority = "critical"
        title = "Fire Detected - Immediate Response Required"
        department = "emergency_department"
        risk_score = 0.95
        recommendation = (
            "Automated fire detection triggered from mobile camera. "
            "Dispatch fire department immediately. Evacuate surrounding area."
        )
    elif incident_type == "smoke":
        incident_id = f"SMK-{timestamp}-{random_suffix}"
        category = "fire"
        priority = "high"
        title = "Smoke Detected - Investigation Required"
        department = "emergency_department"
        risk_score = 0.75
        recommendation = (
            "Smoke detected in camera feed. "
            "Investigate potential fire hazard. Monitor for escalation."
        )
    else:
        incident_id = f"COL-{timestamp}-{random_suffix}"
        category = "accident"
        priority = "critical"
        title = f"Vehicle Collision Detected - {vehicle_count} vehicles, {people_count} people"
        department = "emergency_department"
        risk_score = 0.92
        recommendation = (
            "Automated collision detection triggered. Immediate response required. "
            "Dispatch emergency services to the reported location."
        )

    description_parts = [f"Automated report from mobile CCTV camera."]
    if vehicle_count > 0:
        description_parts.append(f"Vehicles detected: {vehicle_count}")
    if people_count > 0:
        description_parts.append(f"People detected: {people_count}")
    if fire_confidence > 0:
        description_parts.append(f"Fire confidence: {fire_confidence:.1%}")
    if smoke_confidence > 0:
        description_parts.append(f"Smoke confidence: {smoke_confidence:.1%}")
    description_parts.append(f"Coordinates: {latitude:.6f}, {longitude:.6f}")

    incident = Incident(
        incident_id=incident_id,
        category=category,
        title=title,
        description="\n".join(description_parts),
        status="reported",
        priority=priority,
        latitude=latitude,
        longitude=longitude,
        location_address=location_address or f"Location: {latitude:.4f}, {longitude:.4f}",
        assigned_department=department,
        reporter_name="UCRIP Auto-Detect",
        ai_risk_score=risk_score,
        ai_recommendation=recommendation,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

    upload_dir = os.path.join(settings.UPLOAD_DIR, incident_id)
    os.makedirs(upload_dir, exist_ok=True)

    file_content = await screenshot.read()
    file_path = f"{upload_dir}/frame.jpg"
    with open(file_path, "wb") as f:
        f.write(file_content)

    media = IncidentMedia(
        incident_id=incident.id,
        file_path=file_path,
        file_type=screenshot.content_type or "image/jpeg",
        file_size=len(file_content),
    )
    db.add(media)
    await db.commit()

    incident_data = {
        "action": f"{incident_type}_detected",
        "id": str(incident.id),
        "incident_id": incident.incident_id,
        "category": category,
        "title": incident.title,
        "description": incident.description,
        "status": incident.status,
        "priority": incident.priority,
        "latitude": incident.latitude,
        "longitude": incident.longitude,
        "location_address": incident.location_address,
        "assigned_department": incident.assigned_department,
        "ai_risk_score": incident.ai_risk_score,
        "ai_recommendation": incident.ai_recommendation,
        "reporter_name": "UCRIP Auto-Detect",
        "vehicle_count": vehicle_count,
        "people_count": people_count,
        "fire_confidence": fire_confidence,
        "created_at": incident.created_at.isoformat() if incident.created_at else now.isoformat(),
    }
    await manager.broadcast_incident(incident_data)

    await manager.broadcast_alert({
        "type": f"{incident_type}_alert",
        "title": title,
        "incident_id": incident.incident_id,
        "priority": priority,
        "latitude": latitude,
        "longitude": longitude,
    })

    return JSONResponse(status_code=201, content={
        "id": str(incident.id),
        "incident_id": incident.incident_id,
        "category": category,
        "title": title,
        "status": incident.status,
        "priority": priority,
        "message": f"{incident_type.capitalize()} incident reported and broadcast to admin dashboard",
    })
