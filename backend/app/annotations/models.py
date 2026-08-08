from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.maps.models import PoiMap
    from app.places.models import Place


class AnnotationTemplate(Base):
    __tablename__ = "annotation_templates"
    __table_args__ = (
        Index("annotation_templates_map_name_key", "map_id", text("lower(btrim(name))"), unique=True),
        CheckConstraint("shape_type IN ('rectangle', 'triangle', 'circle', 'line', 'path')", name="annotation_templates_shape_type_check"),
        CheckConstraint("sort_order >= 0", name="annotation_templates_sort_order_check"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    map_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("poi_maps.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    shape_type: Mapped[str] = mapped_column(String(20), nullable=False)
    icon: Mapped[str] = mapped_column(String(80), nullable=False, server_default=text("'tabler:map-pin'"))
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default=text("'#0FA68A'"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    map: Mapped["PoiMap"] = relationship()
    annotations: Mapped[list["PlaceAnnotation"]] = relationship(back_populates="template")


class PlaceAnnotation(Base):
    __tablename__ = "place_annotations"
    __table_args__ = (
        Index("place_annotations_place_id_idx", "place_id"),
        Index("place_annotations_template_id_idx", "template_id"),
        CheckConstraint("radius_meters IS NULL OR radius_meters > 0", name="place_annotations_radius_check"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    place_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("annotation_templates.id", ondelete="RESTRICT"), nullable=False)
    # GeoJSON is intentionally retained verbatim to make future KML/PDF exports lossless.
    geometry: Mapped[dict] = mapped_column(JSONB, nullable=False)
    radius_meters: Mapped[float | None] = mapped_column(nullable=True)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    place: Mapped["Place"] = relationship(back_populates="annotations")
    template: Mapped[AnnotationTemplate] = relationship(back_populates="annotations")
