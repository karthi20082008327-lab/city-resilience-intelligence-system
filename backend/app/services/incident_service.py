"""
UCRIP Incident Service
Creates incidents in DB with deduplication, snapshot, and video clip.
"""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.incident import Incident, IncidentMedia
from app.api.websocket import manager

logger = logging.getLogger(__name__)

DEDUP_WINDOW_SECONDS = 60
DEDUP_DISTANCE_METERS = 200


class IncidentService:
    """Service for creating and managing AI-detected incidents."""

    @staticmethod
    async def create_incident(data: dict) -> Optional[Incident]:
        async with async_session() as db:
            if await IncidentService._is_duplicate(db, data):
                logger.info(f"Duplicate incident suppressed: {data.get('incident_id')}")
                return None

            now = datetime.now(timezone.utc)
            incident = Incident(
                incident_id=data["incident_id"],
                category=data["category"],
                title=data["title"],
                description=data.get("description", ""),
                status="reported",
                priority=data.get("priority", "medium"),
                latitude=data.get("latitude"),
                longitude=data.get("longitude"),
                location_address=data.get("location_address", ""),
                assigned_department=data.get("assigned_department", "emergency_department"),
                assigned_to=None,
                reporter_name=data.get("reporter_name", "UCRIP AI"),
                reporter_phone=None,
                reporter_email=None,
                ai_risk_score=data.get("ai_risk_score", 0.0),
                ai_recommendation=data.get("ai_recommendation", ""),
                camera_name=data.get("camera_name"),
                snapshot_path=data.get("snapshot_path"),
                detection_type=data.get("detection_type"),
            )
            db.add(incident)
            await db.commit()
            await db.refresh(incident)

            snapshot_path = data.get("snapshot_path")
            if snapshot_path and os.path.exists(snapshot_path):
                file_size = os.path.getsize(snapshot_path)
                media = IncidentMedia(
                    incident_id=incident.id,
                    file_path=snapshot_path,
                    file_type="image/jpeg",
                    file_size=file_size,
                )
                db.add(media)

            video_path = data.get("video_clip_path")
            if video_path and os.path.exists(video_path):
                file_size = os.path.getsize(video_path)
                media = IncidentMedia(
                    incident_id=incident.id,
                    file_path=video_path,
                    file_type="video/mp4",
                    file_size=file_size,
                )
                db.add(media)

            await db.commit()

            ws_data = {
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
                "ai_recommendation": incident.ai_recommendation,
                "reporter_name": incident.reporter_name,
                "camera_name": data.get("camera_name", ""),
                "snapshot_url": f"/uploads/{os.path.basename(os.path.dirname(snapshot_path))}/snapshot.jpg" if snapshot_path else None,
                "video_url": f"/uploads/{os.path.basename(os.path.dirname(video_path))}/clip.mp4" if video_path else None,
                "detection_type": data.get("detection_type", ""),
                "confidence": data.get("confidence", 0),
                "object_count": data.get("object_count", 0),
                "created_at": incident.created_at.isoformat() if incident.created_at else now.isoformat(),
            }

            await manager.broadcast_incident(ws_data)
            await manager.broadcast_alert({
                "type": f"{data['category']}_alert",
                "title": incident.title,
                "incident_id": incident.incident_id,
                "priority": incident.priority,
                "latitude": incident.latitude,
                "longitude": incident.longitude,
                "snapshot_url": ws_data.get("snapshot_url"),
                "video_url": ws_data.get("video_url"),
            })

            logger.info(f"Incident created: {incident.incident_id} ({incident.category})")
            return incident

    @staticmethod
    async def _is_duplicate(db: AsyncSession, data: dict) -> bool:
        now = datetime.now(timezone.utc)
        window_start = now.timestamp() - DEDUP_WINDOW_SECONDS

        category = data.get("category")
        lat = data.get("latitude", 0)
        lon = data.get("longitude", 0)

        result = await db.execute(
            select(Incident).where(
                and_(
                    Incident.category == category,
                    Incident.created_at >= datetime.fromtimestamp(window_start, tz=timezone.utc),
                )
            )
        )
        recent = result.scalars().all()

        for inc in recent:
            if inc.latitude and inc.longitude:
                dlat = abs(inc.latitude - lat)
                dlon = abs(inc.longitude - lon)
                approx_meters = ((dlat ** 2 + dlon ** 2) ** 0.5) * 111000
                if approx_meters < DEDUP_DISTANCE_METERS:
                    return True
        return False
