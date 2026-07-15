from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


DEFAULT_FIELDS = ["description", "status", "primary_category", "categories", "tags", "region", "construction_date", "abandonment_date", "condition", "access", "danger_level", "created_at", "updated_at"]


class KmzExportOptions(BaseModel):
    category_ids: list[UUID] | None = None
    status_ids: list[UUID] | None = None
    fields: list[str] = Field(default_factory=lambda: list(DEFAULT_FIELDS))
    include_custom_fields: bool = True
    include_images: bool = True


class KmzExportReport(BaseModel):
    map_id: UUID
    map_name: str
    total_places_in_map: int
    exported_places: int
    filtered_places: int
    skipped_places: int
    included_images: int
    skipped_images: int
    custom_fields_count: int
    warnings: list[str]
    errors: list[str]
    file_size: int
    generated_at: datetime


class KmzExportCreated(BaseModel):
    export_id: UUID
    file_name: str
    download_url: str
    expires_at: datetime
    report: KmzExportReport
