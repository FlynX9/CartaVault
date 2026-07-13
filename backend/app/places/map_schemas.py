from uuid import UUID

from pydantic import BaseModel

from app.statuses.schemas import PlaceStatusSummary


class MapCategoryRead(BaseModel):
    """Minimal category representation used by map markers."""

    id: UUID
    name: str


class MapTagRead(BaseModel):
    """Minimal tag representation used by map markers."""

    id: UUID
    name: str


class PlaceMapRead(BaseModel):
    """Minimal place representation used by the interactive map."""

    id: UUID
    map_id: UUID
    name: str
    longitude: float
    latitude: float
    status: PlaceStatusSummary
    categories: list[MapCategoryRead]
    tags: list[MapTagRead]
