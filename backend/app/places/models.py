from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.categories.associations import place_categories_table
from app.database import Base
from app.tags.associations import place_tags_table


if TYPE_CHECKING:
    from app.categories.models import Category
    from app.photos.models import Photo
    from app.maps.models import PoiMap
    from app.tags.models import Tag
    from app.statuses.models import PlaceStatus
    from app.trips.models import TripNight, TripStop


class Place(Base):
    """Database representation of a point of interest."""

    __tablename__ = "places"

    __table_args__ = (
        Index("places_map_id_idx", "map_id"),
        Index("places_status_id_idx", "status_id"),
        Index("places_deleted_at_idx", "deleted_at"),
        Index("places_map_favorite_idx", "map_id", "is_favorite"),
        Index("places_map_interest_rating_idx", "map_id", "interest_rating"),
        Index("places_map_visit_rating_idx", "map_id", "visit_rating"),
        CheckConstraint("interest_rating IS NULL OR interest_rating BETWEEN 1 AND 5", name="places_interest_rating_range"),
        CheckConstraint("visit_rating IS NULL OR visit_rating BETWEEN 1 AND 5", name="places_visit_rating_range"),
        Index(
            "places_location_idx",
            "location",
            postgresql_using="gist",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    location: Mapped[object | None] = mapped_column(
        Geometry(
            geometry_type="POINT",
            srid=4326,
            spatial_index=False,
        ),
        nullable=True,
    )

    map_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("poi_maps.id", ondelete="RESTRICT"),
        nullable=False,
    )

    region: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    construction_date: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    abandonment_date: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    condition: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    access: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    danger_level: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    interest_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    visit_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_by_user_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    custom_fields: Mapped[dict[str, str | list[str]]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    categories: Mapped[list["Category"]] = relationship(
        secondary=place_categories_table,
        back_populates="places",
        order_by="Category.name",
    )

    status_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("place_statuses.id", ondelete="RESTRICT"),
        nullable=False,
    )

    tags: Mapped[list["Tag"]] = relationship(
        secondary=place_tags_table,
        back_populates="places",
        order_by="Tag.name",
    )

    photos: Mapped[list["Photo"]] = relationship(
        back_populates="place",
        order_by="(Photo.is_primary.desc(), Photo.sort_order, Photo.id)",
        passive_deletes=True,
    )

    map: Mapped["PoiMap"] = relationship(
        back_populates="places",
    )

    status: Mapped["PlaceStatus"] = relationship(
        back_populates="places",
    )

    trip_stops: Mapped[list["TripStop"]] = relationship(back_populates="place")
    trip_nights: Mapped[list["TripNight"]] = relationship(back_populates="place")
    links: Mapped[list["PlaceLink"]] = relationship(back_populates="place", cascade="all, delete-orphan", passive_deletes=True, order_by="(PlaceLink.sort_order, PlaceLink.id)")
    history: Mapped[list["PlaceHistory"]] = relationship(back_populates="place", cascade="all, delete-orphan", passive_deletes=True, order_by="PlaceHistory.created_at.desc()")


class PlaceLink(Base):
    __tablename__ = "place_links"
    __table_args__ = (
        Index("place_links_place_id_idx", "place_id"),
        CheckConstraint("url ~ '^https?://[^[:space:]]+$'", name="place_links_http_url_check"),
        CheckConstraint("sort_order >= 0", name="place_links_sort_order_check"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    place_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    place: Mapped[Place] = relationship(back_populates="links")


class PlaceHistory(Base):
    __tablename__ = "place_history"
    __table_args__ = (Index("place_history_place_created_idx", "place_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    place_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    place: Mapped[Place] = relationship(back_populates="history")
