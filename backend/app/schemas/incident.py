from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class IncidentCreate(BaseModel):
    category: str = Field(..., pattern="^(accident|water_leak|fire|power_outage|road_damage|flood|gas_leak|building_collapse|other)$")
    title: str = Field(..., min_length=5, max_length=255)
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_address: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    reporter_email: Optional[str] = None


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_department: Optional[str] = None
    assigned_to: Optional[str] = None
    description: Optional[str] = None


class IncidentMediaResponse(BaseModel):
    id: UUID
    file_path: str
    file_type: str
    file_size: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: UUID
    incident_id: str
    category: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_address: Optional[str] = None
    assigned_department: Optional[str] = None
    assigned_to: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    ai_risk_score: float = 0.0
    ai_recommendation: Optional[str] = None
    camera_name: Optional[str] = None
    snapshot_url: Optional[str] = None
    video_url: Optional[str] = None
    detection_type: Optional[str] = None
    confidence: Optional[float] = None
    object_count: Optional[int] = None
    media: List[IncidentMediaResponse] = []
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
