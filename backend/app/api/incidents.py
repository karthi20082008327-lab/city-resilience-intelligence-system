import os
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.websocket import manager
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.settings import settings
from app.models.incident import Incident, IncidentMedia
from app.models.user import User
from app.schemas.incident import (
    IncidentCreate,
    IncidentListResponse,
    IncidentMediaResponse,
    IncidentResponse,
    IncidentStatsResponse,
    IncidentUpdate,
)

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])


def generate_incident_id(category: str) -> str:
    prefix_map = {
        "accident": "ACC",
        "water_leak": "WTR",
        "fire": "FRE",
        "power_outage": "PWR",
        "road_damage": "RDM",
        "flood": "FLD",
        "gas_leak": "GAS",
        "building_collapse": "BCP",
        "other": "OTH",
    }
    prefix = prefix_map.get(category, "OTH")
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    random_suffix = str(uuid.uuid4())[:4].upper()
    return f"{prefix}-{timestamp}-{random_suffix}"


def calculate_priority(category: str, description: str = None) -> str:
    critical_categories = ["fire", "gas_leak", "building_collapse", "flood"]
    high_categories = ["accident", "power_outage"]
    if category in critical_categories:
        return "critical"
    if category in high_categories:
        return "high"
    if description and any(word in description.lower() for word in ["emergency", "urgent", "danger", "help"]):
        return "high"
    return "medium"


def calculate_risk_score(category: str, priority: str) -> float:
    base_scores = {
        "fire": 0.9,
        "gas_leak": 0.95,
        "building_collapse": 0.95,
        "flood": 0.85,
        "accident": 0.6,
        "power_outage": 0.4,
        "water_leak": 0.3,
        "road_damage": 0.35,
        "other": 0.2,
    }
    priority_multipliers = {"critical": 1.0, "high": 0.8, "medium": 0.6, "low": 0.4}
    score = base_scores.get(category, 0.2) * priority_multipliers.get(priority, 0.6)
    return round(min(score, 1.0), 2)


def get_department(category: str) -> str:
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
    return dept_map.get(category, "emergency_department")


def snapshot_path_to_url(path: str) -> str:
    """Convert an absolute uploads path to a browser-accessible /uploads URL."""
    if not path:
        return None
    norm = path.replace("\\", "/")
    parts = norm.split("/uploads/")
    if len(parts) >= 2:
        return "/uploads/" + parts[-1]
    return None


def incident_to_response(inc: Incident) -> IncidentResponse:
    return IncidentResponse(
        id=inc.id,
        incident_id=inc.incident_id,
        category=inc.category,
        title=inc.title,
        description=inc.description,
        status=inc.status,
        priority=inc.priority,
        latitude=inc.latitude,
        longitude=inc.longitude,
        location_address=inc.location_address,
        assigned_department=inc.assigned_department,
        assigned_to=inc.assigned_to,
        reporter_name=inc.reporter_name,
        reporter_phone=inc.reporter_phone,
        ai_risk_score=inc.ai_risk_score,
        ai_recommendation=inc.ai_recommendation,
        camera_name=inc.camera_name,
        snapshot_url=snapshot_path_to_url(inc.snapshot_path),
        video_url=snapshot_path_to_url(inc.video_clip_path),
        detection_type=inc.detection_type,
        media=[
            IncidentMediaResponse(
                id=m.id, file_path=m.file_path, file_type=m.file_type, file_size=m.file_size, created_at=m.created_at
            )
            for m in (inc.media or [])
        ],
        created_at=inc.created_at,
        updated_at=inc.updated_at,
    )


@router.post("/", response_model=IncidentResponse)
async def create_incident(
    data: IncidentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    incident_id = generate_incident_id(data.category)
    priority = calculate_priority(data.category, data.description)
    risk_score = calculate_risk_score(data.category, priority)
    department = get_department(data.category)

    incident = Incident(
        incident_id=incident_id,
        category=data.category,
        title=data.title,
        description=data.description,
        status="reported",
        priority=priority,
        latitude=data.latitude,
        longitude=data.longitude,
        location_address=data.location_address,
        assigned_department=department,
        reporter_name=data.reporter_name,
        reporter_phone=data.reporter_phone,
        reporter_email=data.reporter_email,
        ai_risk_score=risk_score,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

    await manager.broadcast_incident(
        {
            "action": "created",
            "id": str(incident.id),
            "incident_id": incident.incident_id,
            "category": incident.category,
            "title": incident.title,
            "description": incident.description,
            "status": incident.status,
            "priority": incident.priority,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "location_address": incident.location_address,
            "assigned_department": incident.assigned_department,
            "ai_risk_score": incident.ai_risk_score,
            "reporter_name": incident.reporter_name,
            "created_at": incident.created_at.isoformat() if incident.created_at else None,
        }
    )

    return IncidentResponse(
        id=incident.id,
        incident_id=incident.incident_id,
        category=incident.category,
        title=incident.title,
        description=incident.description,
        status=incident.status,
        priority=incident.priority,
        latitude=incident.latitude,
        longitude=incident.longitude,
        location_address=incident.location_address,
        assigned_department=incident.assigned_department,
        assigned_to=incident.assigned_to,
        reporter_name=incident.reporter_name,
        reporter_phone=incident.reporter_phone,
        ai_risk_score=incident.ai_risk_score,
        ai_recommendation=incident.ai_recommendation,
        media=[],
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.post("/{incident_id}/upload")
async def upload_media(
    incident_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    if file.content_type not in settings.ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported file type")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    upload_dir = os.path.join(settings.UPLOAD_DIR, incident_id)
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    media = IncidentMedia(
        incident_id=incident.id,
        file_path=file_path,
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
    )
    db.add(media)
    await db.commit()

    return {"message": "File uploaded successfully", "file_path": file_path}


@router.get("/", response_model=IncidentListResponse)
async def list_incidents(
    page: int = 1,
    per_page: int = 20,
    category: str = None,
    status_filter: str = None,
    priority: str = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Incident)
    count_query = select(func.count(Incident.id))

    if category:
        query = query.where(Incident.category == category)
        count_query = count_query.where(Incident.category == category)
    if status_filter:
        query = query.where(Incident.status == status_filter)
        count_query = count_query.where(Incident.status == status_filter)
    if priority:
        query = query.where(Incident.priority == priority)
        count_query = count_query.where(Incident.priority == priority)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * per_page
    query = (
        query.options(selectinload(Incident.media)).order_by(Incident.created_at.desc()).offset(offset).limit(per_page)
    )
    result = await db.execute(query)
    incidents = result.scalars().all()

    incident_list = [incident_to_response(inc) for inc in incidents]

    return IncidentListResponse(incidents=incident_list, total=total, page=page, per_page=per_page)


@router.get("/stats", response_model=IncidentStatsResponse)
async def get_incident_stats(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count(Incident.id)))).scalar() or 0
    reported = (await db.execute(select(func.count(Incident.id)).where(Incident.status == "reported"))).scalar() or 0
    acknowledged = (
        await db.execute(select(func.count(Incident.id)).where(Incident.status == "acknowledged"))
    ).scalar() or 0
    in_progress = (
        await db.execute(select(func.count(Incident.id)).where(Incident.status == "in_progress"))
    ).scalar() or 0
    resolved = (await db.execute(select(func.count(Incident.id)).where(Incident.status == "resolved"))).scalar() or 0
    closed = (await db.execute(select(func.count(Incident.id)).where(Incident.status == "closed"))).scalar() or 0
    critical = (await db.execute(select(func.count(Incident.id)).where(Incident.priority == "critical"))).scalar() or 0
    high = (await db.execute(select(func.count(Incident.id)).where(Incident.priority == "high"))).scalar() or 0
    medium = (await db.execute(select(func.count(Incident.id)).where(Incident.priority == "medium"))).scalar() or 0
    low = (await db.execute(select(func.count(Incident.id)).where(Incident.priority == "low"))).scalar() or 0

    return IncidentStatsResponse(
        total=total,
        reported=reported,
        acknowledged=acknowledged,
        in_progress=in_progress,
        resolved=resolved,
        closed=closed,
        critical=critical,
        high=high,
        medium=medium,
        low=low,
    )


@router.put("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: str,
    data: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Incident).where(Incident.incident_id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    if data.status is not None:
        incident.status = data.status
    if data.priority is not None:
        incident.priority = data.priority
    if data.assigned_department is not None:
        incident.assigned_department = data.assigned_department
    if data.assigned_to is not None:
        incident.assigned_to = data.assigned_to
    if data.description is not None:
        incident.description = data.description

    if data.status == "resolved":
        incident.resolved_at = datetime.now(UTC)

    incident.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(incident)

    preloaded = await db.execute(
        select(Incident).where(Incident.incident_id == incident.incident_id).options(selectinload(Incident.media))
    )
    incident = preloaded.scalar_one()
    return incident_to_response(incident)
