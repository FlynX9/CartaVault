from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
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


class Place(Base):
    """Database representation of a point of interest."""

    __tablename__ = "places"

    __table_args__ = (
        Index("places_map_id_idx", "map_id"),
        Index("places_status_id_idx", "status_id"),
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
