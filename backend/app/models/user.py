import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy import String as SAString
from sqlalchemy.orm import relationship

from app.core.database import Base


class UserRoleEnum(enum.StrEnum):
    SUPER_ADMIN = "super_admin"
    TRAFFIC_DEPARTMENT = "traffic_department"
    WATER_DEPARTMENT = "water_department"
    ELECTRICITY_DEPARTMENT = "electricity_department"
    EMERGENCY_DEPARTMENT = "emergency_department"
    DISASTER_MANAGEMENT = "disaster_management"


class Role(Base):
    __tablename__ = "roles"

    id = Column(SAString(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    permissions = Column(Text, nullable=True, default="[]")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(SAString(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role_id = Column(SAString(36), ForeignKey("roles.id"), nullable=False)
    department = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    avatar_url = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    role = relationship("Role", back_populates="users")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(SAString(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(SAString(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="sessions")
