from datetime import date, datetime
from pathlib import PurePosixPath, PureWindowsPath
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def validate_filename_path(filename: str) -> str:
    """Reject absolute paths and directory components in filenames."""

    if (
        filename in {".", ".."}
        or PurePosixPath(filename).name != filename
        or PureWindowsPath(filename).name != filename
    ):
        raise ValueError("The photo filename must not contain a path")

    return filename


class PhotoCreate(BaseModel):
    """Photo metadata accepted before file uploads are implemented."""

    filename: str = Field(min_length=1)
    original_name: str | None = None
    description: str | None = None
    taken_at: date | None = None

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        """Accept a filename only, never a client-controlled path."""

        return validate_filename_path(value)


class PhotoUpdate(BaseModel):
    """Data accepted when partially updating photo metadata."""

    original_name: str | None = None
    description: str | None = None
    taken_at: date | None = None
    is_primary: bool | None = None

class PhotoReorder(BaseModel):
    photo_ids: list[UUID] = Field(min_length=1)


class PhotoRead(BaseModel):
    """Public representation of photo metadata."""

    id: UUID
    place_id: UUID | None
    filename: str
    original_name: str | None
    path: str | None
    description: str | None
    taken_at: date | None
    sort_order: int
    is_primary: bool
    created_at: datetime | None
