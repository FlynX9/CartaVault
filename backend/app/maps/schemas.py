from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.countries.schemas import CountrySummary


class MapCreate(BaseModel):
    country_id: UUID
    name: str | None = Field(default=None, min_length=1, max_length=120)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    default_zoom: int | None = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def validate_center(self) -> Self:
        if (self.center_latitude is None) != (self.center_longitude is None):
            raise ValueError("Center latitude and longitude must be provided together")
        return self


class MapUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    default_zoom: int | None = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def validate_update(self) -> Self:
        supplied = self.model_fields_set
        if "name" in supplied and self.name is None:
            raise ValueError("The name cannot be null")
        center_fields = {"center_latitude", "center_longitude"}
        if supplied & center_fields and not center_fields <= supplied:
            raise ValueError("Center latitude and longitude must be provided together")
        if center_fields <= supplied and ((self.center_latitude is None) != (self.center_longitude is None)):
            raise ValueError("Center latitude and longitude must both be null or both be coordinates")
        return self


class MapRead(BaseModel):
    id: UUID
    name: str
    country_id: UUID
    country: CountrySummary
    center_latitude: float | None
    center_longitude: float | None
    default_zoom: int | None
    effective_center_latitude: float
    effective_center_longitude: float
    effective_default_zoom: int
    min_latitude: float | None
    max_latitude: float | None
    min_longitude: float | None
    max_longitude: float | None
    created_at: datetime
    updated_at: datetime


class MapSummary(BaseModel):
    id: UUID
    name: str
    country: CountrySummary
