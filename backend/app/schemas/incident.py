from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    category: str = Field(
        ..., pattern="^(accident|water_leak|fire|power_outage|road_damage|flood|gas_leak|building_collapse|other)$"
    )
    title: str = Field(..., min_length=5, max_length=255)
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_address: str | None = None
    reporter_name: str | None = None
    reporter_phone: str | None = None
    reporter_email: str | None = None


class IncidentUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_department: str | None = None
    assigned_to: str | None = None
    description: str | None = None


class IncidentMediaResponse(BaseModel):
    id: UUID
    file_path: str
    file_type: str
    file_size: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: UUID
    incident_id: str
    category: str
    title: str
    description: str | None = None
    status: str
    priority: str
    latitude: float | None = None
    longitude: float | None = None
    location_address: str | None = None
    assigned_department: str | None = None
    assigned_to: str | None = None
    reporter_name: str | None = None
    reporter_phone: str | None = None
    ai_risk_score: float = 0.0
    ai_recommendation: str | None = None
    camera_name: str | None = None
    snapshot_url: str | None = None
    video_url: str | None = None
    detection_type: str | None = None
    confidence: float | None = None
    object_count: int | None = None
    media: list[IncidentMediaResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IncidentListResponse(BaseModel):
    incidents: list[IncidentResponse]
    total: int
    page: int
    per_page: int


class IncidentStatsResponse(BaseModel):
    total: int
    reported: int
    acknowledged: int
    in_progress: int
    resolved: int
    closed: int
    critical: int
    high: int
    medium: int
    low: int


class WeatherData(BaseModel):
    temperature: float
    humidity: float
    wind_speed: float
    pressure: float
    description: str
    icon: str
    rain_probability: float = 0.0
    uv_index: float = 0.0
    air_quality: float = 0.0
    city: str
    country: str


class CityRiskScore(BaseModel):
    overall: float
    weather_risk: float
    infrastructure_risk: float
    incident_risk: float
    flood_risk: float
    recommendation: str
