import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.core.settings import settings
from app.core.database import init_db
from app.api import auth_router, users_router, incidents_router, weather_router, dashboard_router, collision_router, stream_router
from app.api.websocket import router as ws_router
from app.models.user import Role
from app.core.database import async_session
from sqlalchemy import select
import logging

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
            ]
            db.add_all(roles)
            await db.commit()
            logger.info("Roles seeded successfully")


async def seed_admin():
    from app.models.user import User
    from app.core.security import hash_password
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == "admin@ucrip.gov"))
        if not result.scalar_one_or_none():
            role_result = await db.execute(select(Role).where(Role.name == "super_admin"))
            role = role_result.scalar_one_or_none()
            if role:
                admin = User(
                    email="admin@ucrip.gov",
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting UCRIP Backend...")
    await init_db()
    await seed_roles()
    await seed_admin()
    logger.info("UCRIP Backend started successfully")
    yield
    logger.info("Shutting down UCRIP Backend...")


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
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
async def root():
    return {"message": "UCRIP API is running", "version": settings.APP_VERSION}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.APP_NAME, "version": settings.APP_VERSION}
