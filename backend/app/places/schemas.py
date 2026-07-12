from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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