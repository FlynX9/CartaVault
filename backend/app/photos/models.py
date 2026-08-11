from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.places.models import Place


class Photo(Base):
    """Database representation of photo metadata."""

    __tablename__ = "photos"

    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="photos_sort_order_nonnegative"),
        CheckConstraint("file_size_bytes IS NULL OR file_size_bytes >= 0", name="photos_file_size_nonnegative"),
        CheckConstraint("width IS NULL OR width > 0", name="photos_width_positive"),
        CheckConstraint("height IS NULL OR height > 0", name="photos_height_positive"),
        CheckConstraint("focal_x >= 0 AND focal_x <= 1", name="photos_focal_x_range"),
        CheckConstraint("focal_y >= 0 AND focal_y <= 1", name="photos_focal_y_range"),
        Index("photos_place_sort_order_key", "place_id", "sort_order", unique=True),
        Index("photos_one_primary_per_place_idx", "place_id", unique=True, postgresql_where=text("is_primary")),
        Index("photos_created_at_idx", "created_at"),
        Index("photos_uploaded_by_user_id_idx", "uploaded_by_user_id"),
        Index("photos_map_id_idx", "map_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    place_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey(
            "places.id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    # A media upload can exist before the user creates a POI.  Keeping the
    # owning map on the photo gives those uploads the same ACL as the map.
    map_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("poi_maps.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Storage must not move when an unassigned upload is later attached to a
    # POI, therefore it has its own immutable directory key.
    storage_scope_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), nullable=True,
    )
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)

    filename: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    original_name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    taken_at: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    focal_x: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.5"))
    focal_y: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0.5"))

    mime_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by_user_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    place: Mapped["Place | None"] = relationship(
        back_populates="photos",
    )
