import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./ucrip.db"
    DATABASE_URL_SYNC: str = "sqlite:///./ucrip.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "change-me-in-production"
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_REFRESH_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://0.0.0.0:5173",
        "https://localhost:5173",
        "https://10.157.48.198:5173",
        "http://10.157.48.198:5173",
    ]
    WEATHER_API_KEY: str = "demo"
    WEATHER_CITY: str = "Vijayamangalam"

    # Single source of truth for the city coordinates across the whole app.
    CITY_NAME: str = "Vijayamangalam"
    CITY_LAT: float = 11.2448
    CITY_LON: float = 77.5017

    # Demo forward-compat aliases (kept for existing callers).
    @property
    def WEATHER_LAT(self) -> float:
        return self.CITY_LAT

    @property
    def WEATHER_LON(self) -> float:
        return self.CITY_LON

    UPLOAD_DIR: str = ""
    MODEL_DIR: str = ""

    APP_NAME: str = "UCRIP"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    MAX_UPLOAD_SIZE_MB: int = 20
    ALLOWED_UPLOAD_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp"]

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # settings.py -> core -> app -> backend -> project root
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        if not self.UPLOAD_DIR:
            self.UPLOAD_DIR = os.path.join(base, "uploads")
        if not self.MODEL_DIR:
            self.MODEL_DIR = os.path.join(base, "backend", "app", "ai", "models")
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)


settings = Settings()
