from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.models.user import User, Role
from app.schemas.user import UserResponse, UserUpdate, UserListResponse

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/", response_model=UserListResponse)
async def list_users(request: Request, page: int = 1, per_page: int = 20, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    offset = (page - 1) * per_page
    result = await db.execute(select(User).offset(offset).limit(per_page))
    users = result.scalars().all()
    total_result = await db.execute(select(func.count(User.id)))
    total = total_result.scalar()

    user_list = []
    for u in users:
        role_result = await db.execute(select(Role).where(Role.id == u.role_id))
        role = role_result.scalar_one_or_none()
        user_list.append(UserResponse(
            id=u.id, email=u.email, username=u.username, full_name=u.full_name,
            role={"id": role.id, "name": role.name, "description": role.description} if role else {"id": u.role_id, "name": "unknown", "description": None},
            is_active=u.is_active, is_verified=u.is_verified, avatar_url=u.avatar_url,
            last_login=u.last_login, created_at=u.created_at
        ))

    return UserListResponse(users=user_list, total=total, page=page, per_page=per_page)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, request: Request, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one_or_none()

    return UserResponse(
        id=user.id, email=user.email, username=user.username, full_name=user.full_name,
        role={"id": role.id, "name": role.name, "description": role.description} if role else {"id": user.role_id, "name": "unknown", "description": None},
        is_active=user.is_active, is_verified=user.is_verified, avatar_url=user.avatar_url,
        last_login=user.last_login, created_at=user.created_at
    )


@router.put("/{user_id}")
async def update_user(user_id: str, data: UserUpdate, request: Request, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.department is not None:
        user.department = data.department
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url

    await db.commit()
    return {"message": "User updated successfully"}


@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"message": "User deleted successfully"}


@router.get("/roles/list")
async def list_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Role))
    roles = result.scalars().all()
    return [{"id": str(r.id), "name": r.name, "description": r.description} for r in roles]
