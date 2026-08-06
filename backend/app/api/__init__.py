from .auth import router as auth_router
from .collision import router as collision_router
from .dashboard import router as dashboard_router
from .incidents import router as incidents_router
from .stream import router as stream_router
from .users import router as users_router
from .weather import router as weather_router

__all__ = [
    "auth_router",
    "users_router",
    "incidents_router",
    "weather_router",
    "dashboard_router",
    "collision_router",
    "stream_router",
]
