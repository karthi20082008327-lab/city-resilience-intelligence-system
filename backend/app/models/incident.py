import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import String as SAString
from sqlalchemy.orm import relationship

from app.core.database import Base


class IncidentCategory(enum.StrEnum):
    ACCIDENT = "accident"
    WATER_LEAK = "water_leak"
    FIRE = "fire"
    POWER_OUTAGE = "power_outage"
    ROAD_DAMAGE = "road_damage"
    FLOOD = "flood"
    GAS_LEAK = "gas_leak"
    BUILDING_COLLAPSE = "building_collapse"
    OTHER = "other"


class IncidentStatus(enum.StrEnum):
    REPORTED = "reported"
    ACKNOWLEDGED = "acknowledged"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class IncidentPriority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(SAString(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(String(30), unique=True, nullable=False, index=True)
    category = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="reported")
    priority = Column(String(10), default="medium")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_address = Column(Text, nullable=True)
    assigned_department = Column(String(100), nullable=True)
    assigned_to = Column(String(255), nullable=True)
    reporter_name = Column(String(255), nullable=True)
    reporter_phone = Column(String(20), nullable=True)
    reporter_email = Column(String(255), nullable=True)
    ai_risk_score = Column(Float, default=0.0)
    ai_recommendation = Column(Text, nullable=True)
    camera_name = Column(String(100), nullable=True)
    snapshot_path = Column(String(500), nullable=True)
    video_clip_path = Column(String(500), nullable=True)
    detection_type = Column(String(50), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    media = relationship("IncidentMedia", back_populates="incident", cascade="all, delete-orphan")


class IncidentMedia(Base):
    __tablename__ = "incident_media"

    id = Column(SAString(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id = Column(SAString(36), ForeignKey("incidents.id"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    incident = relationship("Incident", back_populates="media", foreign_keys=[incident_id])
