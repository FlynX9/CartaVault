from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, SmallInteger, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.auth.models import User
    from app.countries.models import Country
    from app.places.models import Place


class PoiMap(Base):
    """A user-created map attached to exactly one country in V1."""

    __tablename__ = "poi_maps"
    __table_args__ = (
        UniqueConstraint("owner_id", "country_id", name="poi_maps_owner_country_key"),
        CheckConstraint(
            "(center_latitude IS NULL AND center_longitude IS NULL) OR "
            "(center_latitude IS NOT NULL AND center_longitude IS NOT NULL AND "
            "center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180)",
            name="poi_maps_center_consistency",
        ),
        CheckConstraint("default_zoom IS NULL OR default_zoom BETWEEN 1 AND 18", name="poi_maps_default_zoom_range"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    country_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("countries.id", ondelete="RESTRICT"), nullable=False)
    owner_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    center_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_zoom: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    country: Mapped["Country"] = relationship(back_populates="maps")
    owner: Mapped["User"] = relationship(back_populates="owned_maps", foreign_keys=[owner_id])
    memberships: Mapped[list["MapMembership"]] = relationship(back_populates="map", cascade="all, delete-orphan", passive_deletes=True)
    invitations: Mapped[list["MapInvitation"]] = relationship(back_populates="map", cascade="all, delete-orphan", passive_deletes=True)
    places: Mapped[list["Place"]] = relationship(back_populates="map", passive_deletes=True)


class MapMembership(Base):
    __tablename__ = "map_memberships"
    __table_args__ = (
        UniqueConstraint("map_id", "user_id", name="map_memberships_map_user_key"),
        CheckConstraint("role IN ('owner', 'editor', 'viewer')", name="map_memberships_role_check"),
        Index("map_memberships_one_owner_idx", "map_id", unique=True, postgresql_where=text("role = 'owner'")),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    map_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("poi_maps.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    map: Mapped[PoiMap] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")


class MapInvitation(Base):
    __tablename__ = "map_invitations"
    __table_args__ = (
        CheckConstraint("role IN ('editor', 'viewer')", name="map_invitations_role_check"),
        Index("map_invitations_token_hash_key", "token_hash", unique=True),
        Index("map_invitations_map_id_idx", "map_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    map_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("poi_maps.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    map: Mapped[PoiMap] = relationship(back_populates="invitations")
    created_by: Mapped["User"] = relationship(back_populates="created_invitations", foreign_keys=[created_by_user_id])
