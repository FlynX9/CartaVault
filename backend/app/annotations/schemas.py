from __future__ import annotations

from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

ShapeType = Literal["rectangle", "triangle", "circle", "line", "path"]


def _valid_position(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value[:2]) and -180 <= value[0] <= 180 and -90 <= value[1] <= 90


def validate_geometry(shape_type: str, geometry: dict[str, Any], radius_meters: float | None) -> None:
    geometry_type = geometry.get("type") if isinstance(geometry, dict) else None
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if shape_type == "circle":
        if geometry_type != "Point" or not _valid_position(coordinates) or radius_meters is None:
            raise ValueError("A circle requires a GeoJSON Point and a positive radius")
        return
    if radius_meters is not None:
        raise ValueError("Only circles may define a radius")
    if shape_type in {"rectangle", "triangle"}:
        expected = 5 if shape_type == "rectangle" else 4
        ring = coordinates[0] if geometry_type == "Polygon" and isinstance(coordinates, list) and coordinates else None
        if not isinstance(ring, list) or len(ring) != expected or not all(_valid_position(point) for point in ring) or ring[0] != ring[-1]:
            raise ValueError(f"A {shape_type} requires a closed polygon with {expected - 1} vertices")
        return
    expected = 2 if shape_type == "line" else 2
    if geometry_type != "LineString" or not isinstance(coordinates, list) or len(coordinates) < expected or (shape_type == "line" and len(coordinates) != 2) or not all(_valid_position(point) for point in coordinates):
        raise ValueError("A line requires two vertices and a path requires at least two vertices")


class AnnotationTemplateCreate(BaseModel):
    map_id: UUID
    name: str = Field(min_length=1, max_length=100)
    shape_type: ShapeType
    icon: str = Field(default="tabler:map-pin", min_length=1, max_length=80)
    color: str = Field(default="#0FA68A", pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True

    @field_validator("name", "icon")
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip()


class AnnotationTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    shape_type: ShapeType | None = None
    icon: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("name", "icon")
    @classmethod
    def trim(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class AnnotationTemplateRead(BaseModel):
    id: UUID
    map_id: UUID
    name: str
    shape_type: ShapeType
    icon: str
    color: str
    sort_order: int
    is_active: bool
    usage_count: int = 0


class AnnotationTemplateOrder(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=100)


class PlaceAnnotationCreate(BaseModel):
    template_id: UUID
    geometry: dict[str, Any]
    radius_meters: float | None = Field(default=None, gt=0, le=1_000_000)
    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=10_000)


class PlaceAnnotationUpdate(BaseModel):
    geometry: dict[str, Any] | None = None
    radius_meters: float | None = Field(default=None, gt=0, le=1_000_000)
    title: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=10_000)

    @model_validator(mode="after")
    def non_empty(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one annotation field is required")
        return self


class PlaceAnnotationRead(BaseModel):
    id: UUID
    place_id: UUID
    template_id: UUID
    geometry: dict[str, Any]
    radius_meters: float | None
    title: str | None
    description: str | None
    template: AnnotationTemplateRead
