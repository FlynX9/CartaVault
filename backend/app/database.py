import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

from app.config import database_settings

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is not defined")


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=database_settings.pool_size,
    max_overflow=database_settings.max_overflow,
    pool_timeout=database_settings.pool_timeout_seconds,
    pool_recycle=database_settings.pool_recycle_seconds,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """Provide one database session per API request."""

    database_session = SessionLocal()

    try:
        yield database_session
    finally:
        database_session.close()
