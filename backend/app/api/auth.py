import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.core.settings import settings
from app.models.user import Role, User, UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    access_token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": str(user.role_id)})
    expire_days = 30 if data.remember_me else settings.REFRESH_TOKEN_EXPIRE_DAYS
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    expire = datetime.now(UTC) + timedelta(days=expire_days)
    session = UserSession(
        user_id=user.id,
        token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        is_active=True,
        expires_at=expire,
    )
    db.add(session)

    user.last_login = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)

    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one_or_none()

    user_data = UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role={"id": role.id, "name": role.name, "description": role.description}
        if role
        else {"id": user.role_id, "name": "unknown", "description": None},
        is_active=user.is_active,
        is_verified=user.is_verified,
        avatar_url=user.avatar_url,
        last_login=user.last_login,
        created_at=user.created_at,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_data,
    )


@router.post("/register", response_model=TokenResponse)
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where((User.email == data.email) | (User.username == data.username)))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User with this email or username already exists"
        )

    role_result = await db.execute(select(Role).where(Role.name == data.role_name))
    role = role_result.scalar_one_or_none()
    if not role:
        role_result = await db.execute(select(Role).where(Role.name == "traffic_department"))
        role = role_result.scalar_one_or_none()

    user = User(
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role_id=role.id if role else uuid.uuid4(),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": str(user.role_id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session = UserSession(
        user_id=user.id,
        token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        is_active=True,
        expires_at=expire,
    )
    db.add(session)
    await db.commit()
    await db.refresh(user)

    user_data = UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role={"id": role.id, "name": role.name, "description": role.description}
        if role
        else {"id": user.role_id, "name": "unknown", "description": None},
        is_active=user.is_active,
        is_verified=user.is_verified,
        avatar_url=user.avatar_url,
        last_login=user.last_login,
        created_at=user.created_at,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_data,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    payload = verify_token(data.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": str(user.role_id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one_or_none()

    user_data = UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role={"id": role.id, "name": role.name, "description": role.description}
        if role
        else {"id": user.role_id, "name": "unknown", "description": None},
        is_active=user.is_active,
        is_verified=user.is_verified,
        avatar_url=user.avatar_url,
        last_login=user.last_login,
        created_at=user.created_at,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_data,
    )


@router.post("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        result = await db.execute(select(UserSession).where(UserSession.token == token, UserSession.is_active))
        session = result.scalar_one_or_none()
        if session:
            session.is_active = False
            await db.commit()
    return {"message": "Logged out successfully"}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    result.scalar_one_or_none()
    return {
        "message": "If the email exists, a reset link has been sent",
        "token": "mock_reset_token_" + str(uuid.uuid4())[:8],
    }


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    return {"message": "Password reset successfully"}


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.hashed_password = hash_password(data.new_password)
    await db.commit()

    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one_or_none()

    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": {"id": str(role.id), "name": role.name, "description": role.description} if role else None,
        "department": user.department,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "avatar_url": user.avatar_url,
        "phone": user.phone,
        "last_login": str(user.last_login) if user.last_login else None,
        "created_at": str(user.created_at),
    }


@router.get("/sessions")
async def get_sessions(request: Request, db: AsyncSession = Depends(get_db)):
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth.split(" ")[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    result = await db.execute(select(UserSession).where(UserSession.user_id == str(user_id), UserSession.is_active))
    sessions = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "is_active": s.is_active,
            "created_at": str(s.created_at),
            "expires_at": str(s.expires_at),
        }
        for s in sessions
    ]
