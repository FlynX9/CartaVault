from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


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


class PlaceRead(BaseModel):
    """Public representation of a place returned by the API."""

    id: UUID
    name: str
    description: str | None
    address: str | None
    country: str | None
    region: str | None
    longitude: float | None
    latitude: float | None
    created_at: datetime
    updated_at: datetime