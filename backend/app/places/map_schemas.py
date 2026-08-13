from uuid import UUID

from pydantic import BaseModel


class MapStatusRead(BaseModel):
    """Minimal tracking-status representation used by map markers."""

    id: UUID
    color: str


class PlaceMapRead(BaseModel):
    """Minimal place representation used by the interactive map."""

    id: UUID
    map_id: UUID
    name: str
    longitude: float
    latitude: float
    status: MapStatusRead
    primary_category_icon: str | None
    primary_photo_id: UUID | None
    category_ids: list[UUID]
    tag_ids: list[UUID]
    is_favorite: bool


class PlaceMapPageRead(BaseModel):
    """Visible map markers with an explicit truncation indicator."""

    items: list[PlaceMapRead]
    total: int
    returned: int
    truncated: bool
