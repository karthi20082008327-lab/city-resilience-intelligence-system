from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RoleSchema(BaseModel):
    id: UUID
    name: str
    description: str | None = None

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    department: str | None = None
    phone: str | None = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    role_name: str = "traffic_department"


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    avatar_url: str | None = None


class UserResponse(UserBase):
    id: UUID
    role: RoleSchema
    is_active: bool
    is_verified: bool
    avatar_url: str | None = None
    last_login: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    per_page: int
