from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.categories.schemas import CategoryRead
from app.tags.schemas import TagRead


class PlaceCreate(BaseModel):
    """Data accepted by the API when creating a place."""

    name: str = Field(
        min_length=1,
        max_length=255,
    )

    description: str | None = None

    latitude: float = Field(
        ge=-90,
        le=90,
    )

    longitude: float = Field(
        ge=-180,
        le=180,
    )

    address: str | None = None
    country: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=100)
    construction_date: str | None = Field(default=None, max_length=100)
    abandonment_date: str | None = Field(default=None, max_length=100)
    condition: str | None = Field(default=None, max_length=50)
    access: str | None = Field(default=None, max_length=50)
    danger_level: str | None = Field(default=None, max_length=50)
    owner: str | None = Field(default=None, max_length=255)


class PlaceUpdate(BaseModel):
    """Data accepted when partially updating an existing place."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    description: str | None = None

    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
    )

    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
    )

    address: str | None = None
    country: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=100)
    construction_date: str | None = Field(default=None, max_length=100)
    abandonment_date: str | None = Field(default=None, max_length=100)
    condition: str | None = Field(default=None, max_length=50)
    access: str | None = Field(default=None, max_length=50)
    danger_level: str | None = Field(default=None, max_length=50)
    owner: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_partial_update(self) -> Self:
        """Validate fields whose rules depend on other supplied fields."""

        supplied_fields = self.model_fields_set

        if "name" in supplied_fields and self.name is None:
            raise ValueError("The name cannot be null")

        latitude_supplied = "latitude" in supplied_fields
        longitude_supplied = "longitude" in supplied_fields

        if latitude_supplied != longitude_supplied:
            raise ValueError(
                "Latitude and longitude must be provided together"
            )

        if latitude_supplied and (
            self.latitude is None or self.longitude is None
        ):
            raise ValueError(
                "Latitude and longitude cannot be null"
            )

        return self


class PlaceRead(BaseModel):
    """Public representation of a place returned by the API."""

    id: UUID
    name: str
    description: str | None
    address: str | None
    country: str | None
    region: str | None
    construction_date: str | None
    abandonment_date: str | None
    condition: str | None
    access: str | None
    danger_level: str | None
    owner: str | None
    longitude: float | None
    latitude: float | None
    categories: list[CategoryRead]
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime
