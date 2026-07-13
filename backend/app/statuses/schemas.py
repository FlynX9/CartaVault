import re
from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


def normalize_color(value: str) -> str:
    """Validate and normalize a hexadecimal color."""

    normalized = value.strip().upper()
    if COLOR_PATTERN.fullmatch(normalized) is None:
        raise ValueError("The color must use the #RRGGBB format")
    return normalized


class PlaceStatusCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str
    sort_order: int = Field(default=0, ge=0)
    is_default: bool = False
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("The status name cannot be blank")
        return normalized

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        return normalize_color(value)

    @model_validator(mode="after")
    def validate_default_is_active(self) -> Self:
        if self.is_default and not self.is_active:
            raise ValueError("The default status must be active")
        return self


class PlaceStatusUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    is_default: bool | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("The status name cannot be blank")
        return normalized

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        return None if value is None else normalize_color(value)

    @model_validator(mode="after")
    def reject_null_fields(self) -> Self:
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"The {field_name} field cannot be null")
        return self


class PlaceStatusSummary(BaseModel):
    id: UUID
    name: str
    slug: str
    color: str
    is_active: bool


class PlaceStatusRead(PlaceStatusSummary):
    sort_order: int
    is_default: bool
    created_at: datetime
    updated_at: datetime
    places_count: int = 0
