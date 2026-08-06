from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GoogleSatelliteUsageDaily(Base):
    __tablename__ = "google_satellite_usage_daily"
    __table_args__ = (
        UniqueConstraint("usage_date", "user_id", name="google_satellite_usage_daily_date_user_key"),
        Index("google_satellite_usage_daily_date_idx", "usage_date"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sessions_started: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tiles_started: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tiles_completed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tiles_failed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    tiles_cancelled: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
