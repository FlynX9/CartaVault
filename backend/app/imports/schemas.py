"""Public request and response contracts for the preview-first KMZ flow."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class KmzImagePreview(BaseModel):
    internal_id: str
    original_name: str
    mime_type: str
    size: int = Field(ge=0)
    source_type: str
    host: str | None = None


class KmzImportItemPreview(BaseModel):
    source_index: int = Field(ge=0)
    selected_by_default: bool
    name: str | None
    latitude: float | None
    longitude: float | None
    altitude: float | None
    mapped_fields: dict[str, str]
    custom_fields: dict[str, str | list[str]]
    images: list[KmzImagePreview]
    warnings: list[str]
    errors: list[str]
    importable: bool
    already_imported: bool
    duplicate_reason: Literal["within_file", "existing_map"] | None = None


class KmzPreviewRead(BaseModel):
    import_id: UUID
    file_name: str
    placemark_count: int = Field(ge=0)
    valid_count: int = Field(ge=0)
    warning_count: int = Field(ge=0)
    error_count: int = Field(ge=0)
    items: list[KmzImportItemPreview]
    global_warnings: list[str]


class KmzConfirmRequest(BaseModel):
    import_id: UUID
    selected_source_indexes: list[int] = Field(min_length=1)
    download_remote_images: bool = False
    force_source_indexes: list[int] = Field(default_factory=list)


class KmzImportFailure(BaseModel):
    source_index: int
    message: str


class KmzImportReport(BaseModel):
    created_count: int = Field(ge=0)
    skipped_count: int = Field(ge=0)
    error_count: int = Field(ge=0)
    images_added: int = Field(ge=0)
    embedded_images_added: int = Field(ge=0)
    remote_images_added: int = Field(ge=0)
    remote_images_unavailable: int = Field(ge=0)
    created_place_ids: list[UUID]
    failures: list[KmzImportFailure]
    warnings: list[str]


class KmzImportJobStart(BaseModel):
    job_id: UUID


class KmzImportProgressRead(BaseModel):
    job_id: UUID
    status: Literal["pending", "running", "completed", "failed"]
    completed: int = Field(ge=0)
    total: int = Field(ge=1)
    percent: int = Field(ge=0, le=100)
    message: str
    report: KmzImportReport | None = None
    error: str | None = None
