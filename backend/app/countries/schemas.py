from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CountrySummary(BaseModel):
    id: UUID
    iso_alpha2: str
    iso_alpha3: str
    name: str


class CountryRead(CountrySummary):
    center_latitude: float
    center_longitude: float
    default_zoom: int
    min_latitude: float | None
    max_latitude: float | None
    min_longitude: float | None
    max_longitude: float | None
    created_at: datetime
    updated_at: datetime


class CountryBoundaryGeometry(BaseModel):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: list[list[list[list[float]]]]


class CountryBoundaryRead(BaseModel):
    country_id: UUID
    iso_alpha3: str
    detail: Literal["low", "medium", "high"]
    geometry: CountryBoundaryGeometry
    point_count: int
