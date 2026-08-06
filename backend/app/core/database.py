from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import logging
from app.core.settings import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create tables. Prefers running Alembic migrations; falls back to
    create_all for a fresh development database."""
    try:
        from alembic import command
        from alembic.config import Config
        from sqlalchemy import create_engine, inspect

        sync_url = settings.DATABASE_URL_SYNC
        engine_sync = create_engine(sync_url)
        with engine_sync.connect() as conn:
            has_target = bool(inspect(conn).get_table_names())
        engine_sync.dispose()

        if not has_target:
            cfg = Config("alembic.ini")
            cfg.set_main_option("script_location", "migrations")
            cfg.set_main_option("sqlalchemy.url", sync_url)
            command.upgrade(cfg, "head")
            logger.info("Database migrated via Alembic (head)")
            return
    except Exception as e:
        logger.warning("Alembic migration skipped (%s). Using create_all.", e)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
