import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api import (
    auth_router,
    collision_router,
    dashboard_router,
    incidents_router,
    stream_router,
    users_router,
    weather_router,
)
from app.api.websocket import router as ws_router
from app.core.database import async_session, init_db
from app.core.settings import settings
from app.models.user import Role

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def seed_roles():
    async with async_session() as db:
        result = await db.execute(select(Role))
        existing = result.scalars().all()
        if not existing:
            roles = [
                Role(name="super_admin", description="Full system access"),
                Role(name="traffic_department", description="Traffic management"),
                Role(name="water_department", description="Water infrastructure"),
                Role(name="electricity_department", description="Power infrastructure"),
                Role(name="emergency_department", description="Emergency response"),
                Role(name="disaster_management", description="Disaster response"),
                Role(name="surveillance_department", description="Surveillance and field operations"),
            ]
            db.add_all(roles)
            await db.commit()
            logger.info("Roles seeded successfully")


async def seed_admin():
    from app.core.security import hash_password
    from app.models.user import User

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == "admin@cris.gov"))
        if not result.scalar_one_or_none():
            role_result = await db.execute(select(Role).where(Role.name == "super_admin"))
            role = role_result.scalar_one_or_none()
            if role:
                admin = User(
                    email="admin@cris.gov",
                    username="admin",
                    full_name="System Administrator",
                    hashed_password=hash_password("Admin@123456"),
                    role_id=role.id,
                    department="Administration",
                    is_active=True,
                    is_verified=True,
                )
                db.add(admin)
                await db.commit()
                logger.info("Admin user seeded successfully")


DEPARTMENT_USERS = [
    {"email": "emergency@cris.gov", "username": "emergency", "full_name": "Emergency Department", "role": "emergency_department", "department": "Emergency Department"},
    {"email": "traffic@cris.gov", "username": "traffic", "full_name": "Traffic Department", "role": "traffic_department", "department": "Traffic Department"},
    {"email": "water@cris.gov", "username": "water", "full_name": "Water Department", "role": "water_department", "department": "Water Department"},
    {"email": "electricity@cris.gov", "username": "electricity", "full_name": "Electricity Department", "role": "electricity_department", "department": "Electricity Department"},
    {"email": "disaster@cris.gov", "username": "disaster", "full_name": "Disaster Management", "role": "disaster_management", "department": "Disaster Management"},
    {"email": "srinidhi@cris.gov", "username": "srinidhi", "full_name": "Srinidhi", "role": "surveillance_department", "department": "Surveillance Department"},
]


async def seed_department_users():
    from app.core.security import hash_password
    from app.models.user import User

    async with async_session() as db:
        for dept in DEPARTMENT_USERS:
            result = await db.execute(select(User).where(User.email == dept["email"]))
            if not result.scalar_one_or_none():
                role_result = await db.execute(select(Role).where(Role.name == dept["role"]))
                role = role_result.scalar_one_or_none()
                if role:
                    user = User(
                        email=dept["email"],
                        username=dept["username"],
                        full_name=dept["full_name"],
                        hashed_password=hash_password("Dept@123456"),
                        role_id=role.id,
                        department=dept["department"],
                        is_active=True,
                        is_verified=True,
                    )
                    db.add(user)
        await db.commit()
        logger.info("Department users seeded successfully")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CRIS Backend...")
    await init_db()
    await seed_roles()
    await seed_admin()
    await seed_department_users()
    logger.info("CRIS Backend started successfully")
    yield
    logger.info("Shutting down CRIS Backend...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Urban Cascade Risk Intelligence Platform API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(incidents_router)
app.include_router(weather_router)
app.include_router(dashboard_router)
app.include_router(collision_router)
app.include_router(stream_router)
app.include_router(ws_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
    logger.error(tb)
    return JSONResponse(status_code=500, content={"detail": str(exc), "path": request.url.path})


@app.get("/")
async def root():
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"message": "CRIS API is running", "version": settings.APP_VERSION}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.APP_NAME, "version": settings.APP_VERSION}


# Serve built frontend (Vite) at the same URL as the API. Registered last so
# API routes take precedence.
BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")

    logger.info(f"Serving frontend from {FRONTEND_DIST}")
else:
    logger.warning(f"Frontend dist not found at {FRONTEND_DIST}")
