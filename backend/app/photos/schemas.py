from datetime import date, datetime
from pathlib import PurePosixPath, PureWindowsPath
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


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

    filename: str | None = Field(
        default=None,
        min_length=1,
    )
    original_name: str | None = None
    description: str | None = None
    taken_at: date | None = None

    @field_validator("filename")
    @classmethod
    def validate_filename_path_components(
        cls,
        value: str | None,
    ) -> str | None:
        """Accept a filename only, never a client-controlled path."""

        return validate_filename_path(value) if value is not None else None

    @model_validator(mode="after")
    def validate_filename(self) -> Self:
        """Prevent the mandatory filename from being explicitly cleared."""

        if "filename" in self.model_fields_set and self.filename is None:
            raise ValueError("The photo filename cannot be null")

        return self


class PhotoRead(BaseModel):
    """Public representation of photo metadata."""

    id: UUID
    place_id: UUID | None
    filename: str
    original_name: str | None
    path: str | None
    description: str | None
    taken_at: date | None
    created_at: datetime | None
