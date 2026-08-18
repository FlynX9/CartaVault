import os
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

from app.config import database_settings

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is not defined")


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


def _engine_options(url: str) -> dict[str, object]:
    """Return pool options supported by the selected SQLAlchemy dialect."""

    options: dict[str, object] = {"pool_pre_ping": True}
    if make_url(url).get_backend_name() != "sqlite":
        options.update(
            pool_size=database_settings.pool_size,
            max_overflow=database_settings.max_overflow,
            pool_timeout=database_settings.pool_timeout_seconds,
            pool_recycle=database_settings.pool_recycle_seconds,
        )
    return options


engine = create_engine(database_url, **_engine_options(database_url))

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[Session, None]:
    """Provide one database session per API request.

    The async dependency guarantees that cleanup does not need a free AnyIO
    worker thread. This avoids the classic deadlock where every worker waits
    for a pooled connection while session finalizers are queued behind them.
    """

    database_session = SessionLocal()

    try:
        yield database_session
    finally:
        database_session.close()
