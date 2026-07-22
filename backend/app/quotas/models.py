from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.quotas.registry import QUOTA_KEYS

if TYPE_CHECKING:
    from app.auth.models import User


UNLIMITED_PROFILE_ID = UUID("00000000-0000-0000-0000-000000000001")


class QuotaProfile(Base):
    __tablename__ = "quota_profiles"
    __table_args__ = (
        Index("quota_profiles_name_key", text("lower(btrim(name))"), unique=True),
        Index("quota_profiles_one_default_idx", "is_default", unique=True, postgresql_where=text("is_default")),
        *(
            CheckConstraint(f"{key} IS NULL OR {key} >= 0", name=f"quota_profiles_{key}_nonnegative")
            for key in QUOTA_KEYS
        ),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    maps_max: Mapped[int | None] = mapped_column(Integer)
    trips_total_max: Mapped[int | None] = mapped_column(Integer)
    storage_bytes_max: Mapped[int | None] = mapped_column(BigInteger)
    photos_total_max: Mapped[int | None] = mapped_column(Integer)
    memberships_total_max: Mapped[int | None] = mapped_column(Integer)
    pending_invitations_max: Mapped[int | None] = mapped_column(Integer)
    places_per_map_max: Mapped[int | None] = mapped_column(Integer)
    tags_per_map_max: Mapped[int | None] = mapped_column(Integer)
    categories_per_map_max: Mapped[int | None] = mapped_column(Integer)
    statuses_per_map_max: Mapped[int | None] = mapped_column(Integer)
    trips_per_map_max: Mapped[int | None] = mapped_column(Integer)
    members_per_map_max: Mapped[int | None] = mapped_column(Integer)
    pending_invitations_per_map_max: Mapped[int | None] = mapped_column(Integer)
    photos_per_place_max: Mapped[int | None] = mapped_column(Integer)
    links_per_place_max: Mapped[int | None] = mapped_column(Integer)
    days_per_trip_max: Mapped[int | None] = mapped_column(Integer)
    steps_per_day_max: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="quota_profile")
