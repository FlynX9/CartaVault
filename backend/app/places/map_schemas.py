from uuid import UUID
from typing import Literal

from pydantic import BaseModel

class MapCategoryRead(BaseModel):
    """Minimal category representation used by map markers."""

    id: UUID
    name: str
    icon: str
    is_primary: bool


class MapTagRead(BaseModel):
    """Minimal tag representation used by map markers."""

    id: UUID
    name: str


class MapStatusRead(BaseModel):
    """Minimal tracking-status representation used by map markers."""

    id: UUID
    name: str
    slug: str
    color: str
    functional_state: Literal["non_visited", "visited"]


class PrimaryCategoryRead(BaseModel):
    id: UUID
    name: str
    icon: str


class PlaceMapRead(BaseModel):
    """Minimal place representation used by the interactive map."""

    id: UUID
    map_id: UUID
    name: str
    longitude: float
    latitude: float
    status: MapStatusRead
    primary_category: PrimaryCategoryRead | None
    categories: list[MapCategoryRead]
    tags: list[MapTagRead]
    is_favorite: bool
    is_visited: bool
    interest_rating: int | None
    visit_rating: int | None


class PlaceMapPageRead(BaseModel):
    """Visible map markers with an explicit truncation indicator."""

    items: list[PlaceMapRead]
    total: int
    returned: int
    truncated: bool
