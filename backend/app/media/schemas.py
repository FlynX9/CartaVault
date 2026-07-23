from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MediaMapSummary(BaseModel):
    id: UUID
    name: str
    country_code: str
    country_name: str


class MediaPlaceSummary(BaseModel):
    id: UUID
    name: str
    region: str | None


class MediaUploaderSummary(BaseModel):
    id: UUID
    name: str


class MediaItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_name: str | None
    caption: str | None
    taken_at: date | None
    created_at: datetime | None
    updated_at: datetime | None
    is_primary: bool
    mime_type: str | None
    format: str | None
    file_size_bytes: int | None
    width: int | None
    height: int | None
    file_state: str
    can_edit: bool
    place: MediaPlaceSummary
    map: MediaMapSummary
    uploader: MediaUploaderSummary | None


class MediaFilterOptions(BaseModel):
    maps: list[MediaMapSummary]
    formats: list[str]
    uploaders: list[MediaUploaderSummary]


class MediaAggregates(BaseModel):
    total_count: int
    total_size_bytes: int
    primary_count: int
    missing_count: int
    error_count: int


class MediaPage(BaseModel):
    items: list[MediaItemRead]
    page: int
    page_size: int
    total: int
    pages: int
    aggregates: MediaAggregates
    filters: MediaFilterOptions


class MediaUpdate(BaseModel):
    caption: str | None = Field(default=None, max_length=2000)
    taken_at: date | None = None


class MediaBulkDelete(BaseModel):
    media_ids: list[UUID] = Field(min_length=1, max_length=500)


class MediaBulkDeleteResult(BaseModel):
    selected_count: int
    deleted_count: int
