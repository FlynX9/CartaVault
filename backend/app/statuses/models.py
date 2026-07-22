from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.maps.models import PoiMap
    from app.places.models import Place


class StatusFunctionalState(StrEnum):
    NON_VISITED = "non_visited"
    VISITED = "visited"


class PlaceStatus(Base):
    """Configurable tracking status assigned to a place."""

    __tablename__ = "place_statuses"

    __table_args__ = (
        CheckConstraint(
            "sort_order >= 0",
            name="place_statuses_sort_order_nonnegative",
        ),
        CheckConstraint(
            "btrim(name) <> ''",
            name="place_statuses_name_nonempty",
        ),
        CheckConstraint(
            "color ~ '^#[0-9A-F]{6}$'",
            name="place_statuses_color_format",
        ),
        CheckConstraint(
            "functional_state IN ('non_visited', 'visited')",
            name="place_statuses_functional_state_check",
        ),
        Index(
            "place_statuses_one_default_idx",
            "map_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        Index("place_statuses_map_functional_state_idx", "map_id", "functional_state"),
        Index("place_statuses_map_slug_key", "map_id", "slug", unique=True),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    map_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("poi_maps.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    functional_state: Mapped[str] = mapped_column(String(16), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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

    map: Mapped["PoiMap"] = relationship(back_populates="statuses")
    places: Mapped[list["Place"]] = relationship(back_populates="status")
