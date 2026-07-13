from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, SmallInteger, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.countries.models import Country
    from app.places.models import Place


class PoiMap(Base):
    """A user-created map attached to exactly one country in V1."""

    __tablename__ = "poi_maps"
    __table_args__ = (
        UniqueConstraint("country_id", name="poi_maps_country_id_key"),
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
    center_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_zoom: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    country: Mapped["Country"] = relationship(back_populates="maps")
    places: Mapped[list["Place"]] = relationship(back_populates="map", passive_deletes=True)
