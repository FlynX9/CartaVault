from datetime import datetime
from typing import Literal, Self
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.categories.schemas import CategoryRead


class PlaceCategoryRead(CategoryRead):
    is_primary: bool
from app.maps.schemas import MapSummary
from app.tags.schemas import TagRead
from app.statuses.schemas import PlaceStatusSummary


class PlaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    map_id: UUID
    status_id: UUID | None = None
    description: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str | None = Field(default=None, max_length=100)
    construction_date: str | None = Field(default=None, max_length=100)
    abandonment_date: str | None = Field(default=None, max_length=100)
    condition: str | None = Field(default=None, max_length=50)
    access: str | None = Field(default=None, max_length=50)
    danger_level: str | None = Field(default=None, max_length=50)
    is_favorite: bool = False
    interest_rating: float | None = Field(default=None, ge=1, le=5, multiple_of=0.5)
    visit_rating: float | None = Field(default=None, ge=1, le=5, multiple_of=0.5)


class PlaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    map_id: UUID | None = None
    status_id: UUID | None = None
    description: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    region: str | None = Field(default=None, max_length=100)
    construction_date: str | None = Field(default=None, max_length=100)
    abandonment_date: str | None = Field(default=None, max_length=100)
    condition: str | None = Field(default=None, max_length=50)
    access: str | None = Field(default=None, max_length=50)
    danger_level: str | None = Field(default=None, max_length=50)
    is_favorite: bool | None = None
    interest_rating: float | None = Field(default=None, ge=1, le=5, multiple_of=0.5)
    visit_rating: float | None = Field(default=None, ge=1, le=5, multiple_of=0.5)

    @model_validator(mode="after")
    def validate_partial_update(self) -> Self:
        supplied = self.model_fields_set
        if "name" in supplied and self.name is None:
            raise ValueError("The name cannot be null")
        if "map_id" in supplied and self.map_id is None:
            raise ValueError("The map_id cannot be null")
        if "status_id" in supplied and self.status_id is None:
            raise ValueError("The status_id cannot be null")
        latitude_supplied = "latitude" in supplied
        longitude_supplied = "longitude" in supplied
        if latitude_supplied != longitude_supplied:
            raise ValueError("Latitude and longitude must be provided together")
        if latitude_supplied and (self.latitude is None or self.longitude is None):
            raise ValueError("Latitude and longitude cannot be null")
        if "is_favorite" in supplied and self.is_favorite is None:
            raise ValueError("is_favorite cannot be null")
        return self


class PlaceLinkCreate(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    label: str | None = Field(default=None, max_length=120)
    sort_order: int = Field(default=0, ge=0, le=32767)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        normalized = value.strip()
        parsed = urlsplit(normalized)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or any(character.isspace() for character in normalized):
            raise ValueError("Only HTTP and HTTPS URLs are allowed")
        return normalized


class PlaceLinkUpdate(BaseModel):
    url: str | None = Field(default=None, min_length=8, max_length=2048)
    label: str | None = Field(default=None, max_length=120)
    sort_order: int | None = Field(default=None, ge=0, le=32767)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        parsed = urlsplit(normalized)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or any(character.isspace() for character in normalized):
            raise ValueError("Only HTTP and HTTPS URLs are allowed")
        return normalized

    @model_validator(mode="after")
    def reject_required_nulls(self) -> "PlaceLinkUpdate":
        supplied = self.model_fields_set
        if "url" in supplied and self.url is None:
            raise ValueError("url cannot be null")
        if "sort_order" in supplied and self.sort_order is None:
            raise ValueError("sort_order cannot be null")
        return self


class PlaceLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    url: str
    label: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PlaceHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    action: str
    changes: dict
    created_at: datetime


class PlaceRead(BaseModel):
    id: UUID
    name: str
    map_id: UUID
    map: MapSummary
    status: PlaceStatusSummary
    description: str | None
    region: str | None
    construction_date: str | None
    abandonment_date: str | None
    condition: str | None
    access: str | None
    danger_level: str | None
    custom_fields: dict[str, str | list[str]]
    longitude: float | None
    latitude: float | None
    categories: list[PlaceCategoryRead]
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime
    is_favorite: bool
    interest_rating: float | None
    visit_rating: float | None
    is_visited: bool
    deleted_at: datetime | None
    links: list[PlaceLinkRead]
    field_config: dict[str, bool]
    primary_photo_id: UUID | None = None


class PlaceBulkAction(BaseModel):
    """Explicit, bounded atomic action for a selected page of places."""

    place_ids: list[UUID] = Field(min_length=1, max_length=500)
    action: Literal["set_status", "add_category", "remove_category", "add_tag", "remove_tag", "delete"]
    status_id: UUID | None = None
    category_id: UUID | None = None
    tag_id: UUID | None = None

    @model_validator(mode="after")
    def validate_action_target(self) -> Self:
        required = {"set_status": "status_id", "add_category": "category_id", "remove_category": "category_id", "add_tag": "tag_id", "remove_tag": "tag_id"}
        field_name = required.get(self.action)
        if field_name and getattr(self, field_name) is None:
            raise ValueError(f"{field_name} is required for {self.action}")
        if len(set(self.place_ids)) != len(self.place_ids):
            raise ValueError("place_ids must not contain duplicates")
        return self


class PlaceBulkResult(BaseModel):
    selected_count: int
    updated_count: int = 0
    unchanged_count: int = 0
    deleted_count: int = 0


class PlaceBulkTripAction(BaseModel):
    place_ids: list[UUID] = Field(min_length=1, max_length=500)
    trip_id: UUID
    day_id: UUID

    @model_validator(mode="after")
    def unique_places(self) -> Self:
        if len(set(self.place_ids)) != len(self.place_ids):
            raise ValueError("place_ids must not contain duplicates")
        return self


class PlaceBulkTripResult(BaseModel):
    selected_count: int
    added_count: int
    duplicate_count: int


class PlaceFacetItem(BaseModel):
    id: UUID | None = None
    name: str | None = None
    value: str | None = None
    icon: str | None = None
    color: str | None = None
    count: int


class PlaceFacets(BaseModel):
    total: int
    non_visited: int
    visited: int
    favorites: int
    categories: list[PlaceFacetItem]
    tags: list[PlaceFacetItem]
    statuses: list[PlaceFacetItem]
    regions: list[PlaceFacetItem]
    access_values: list[PlaceFacetItem]
    danger_levels: list[PlaceFacetItem]
    condition_values: list[PlaceFacetItem]
    with_photos: int
    without_photos: int
    with_coordinates: int
    without_coordinates: int
    in_trip: int
    not_in_trip: int


class PlaceListPosition(BaseModel):
    """Position of an accessible place in the current filtered list."""

    place_id: UUID
    matches_filters: bool
    index: int | None = None
    page: int | None = None
    page_size: int
