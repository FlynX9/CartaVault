from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Float, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.maps.models import PoiMap


class Country(Base):
    """A country available when creating a POI map."""

    __tablename__ = "countries"
    __table_args__ = (
        CheckConstraint("iso_alpha2 = upper(iso_alpha2)", name="countries_iso_alpha2_uppercase"),
        CheckConstraint("iso_alpha3 = upper(iso_alpha3)", name="countries_iso_alpha3_uppercase"),
        CheckConstraint("center_latitude BETWEEN -90 AND 90", name="countries_center_latitude_range"),
        CheckConstraint("center_longitude BETWEEN -180 AND 180", name="countries_center_longitude_range"),
        CheckConstraint("default_zoom BETWEEN 1 AND 18", name="countries_default_zoom_range"),
        CheckConstraint(
            "(min_latitude IS NULL AND max_latitude IS NULL AND min_longitude IS NULL AND max_longitude IS NULL) OR "
            "(min_latitude IS NOT NULL AND max_latitude IS NOT NULL AND min_longitude IS NOT NULL AND max_longitude IS NOT NULL AND "
            "min_latitude BETWEEN -90 AND 90 AND max_latitude BETWEEN -90 AND 90 AND "
            "min_longitude BETWEEN -180 AND 180 AND max_longitude BETWEEN -180 AND 180 AND "
            "min_latitude < max_latitude AND min_longitude < max_longitude)",
            name="countries_bounds_consistency",
        ),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    iso_alpha2: Mapped[str] = mapped_column(String(2), unique=True, nullable=False)
    iso_alpha3: Mapped[str] = mapped_column(String(3), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    center_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    center_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    default_zoom: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    min_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    maps: Mapped[list["PoiMap"]] = relationship(back_populates="country")
