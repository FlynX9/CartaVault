from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


VECTOR_BASEMAP_STATES = (
    "not_installed", "downloading", "generating", "validating", "ready",
    "update_available", "error", "deleting",
)


class VectorBasemap(Base):
    __tablename__ = "vector_basemaps"
    __table_args__ = (
        CheckConstraint(
            "state IN ('not_installed','downloading','generating','validating','ready','update_available','error','deleting')",
            name="vector_basemaps_state_check",
        ),
        CheckConstraint("progress IS NULL OR progress BETWEEN 0 AND 100", name="vector_basemaps_progress_check"),
    )

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    country_name: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'geofabrik'"))
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, server_default=text("'not_installed'"))
    phase: Mapped[str | None] = mapped_column(String(64))
    progress: Mapped[int | None] = mapped_column(Integer)
    task_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("background_tasks.id", ondelete="SET NULL"))
    installed_at: Mapped[datetime | None] = mapped_column(DateTime)
    source_date: Mapped[datetime | None] = mapped_column(DateTime)
    version: Mapped[str | None] = mapped_column(String(120))
    file_path: Mapped[str | None] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    source_size: Mapped[int | None] = mapped_column(BigInteger)
    min_zoom: Mapped[int | None] = mapped_column(Integer)
    max_zoom: Mapped[int | None] = mapped_column(Integer)
    schema: Mapped[str | None] = mapped_column(String(64))
    last_error_code: Mapped[str | None] = mapped_column(String(80))
    last_error_message: Mapped[str | None] = mapped_column(Text)
    generation_started_at: Mapped[datetime | None] = mapped_column(DateTime)
    generation_finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
