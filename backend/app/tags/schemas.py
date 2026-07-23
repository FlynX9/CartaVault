import re
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

DEFAULT_TAG_COLOR = "#0FA68A"
TAG_COLOR_PATTERN = re.compile(r"^#[0-9A-F]{6}$")


def normalize_tag_color(value: object) -> object:
    if not isinstance(value, str):
        return value
    color = value.strip().upper()
    if not TAG_COLOR_PATTERN.fullmatch(color):
        raise ValueError("The tag color must use the #RRGGBB format")
    return color


class TagCreate(BaseModel):
    """Data accepted when creating a tag."""

    name: str = Field(
        min_length=1,
        max_length=100,
    )
    map_id: UUID
    color: str = DEFAULT_TAG_COLOR

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        """Normalize surrounding whitespace before length validation."""

        return value.strip() if isinstance(value, str) else value

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, value: object) -> object:
        return normalize_tag_color(value)


class TagUpdate(BaseModel):
    """Data accepted when partially updating a tag."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    color: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        """Normalize surrounding whitespace before length validation."""

        return value.strip() if isinstance(value, str) else value

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, value: object) -> object:
        return normalize_tag_color(value)

    @model_validator(mode="after")
    def validate_name(self) -> Self:
        """Prevent the mandatory name from being explicitly cleared."""

        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("The tag name cannot be null")
        if "color" in self.model_fields_set and self.color is None:
            raise ValueError("The tag color cannot be null")

        return self


class TagRead(BaseModel):
    """Public representation of a tag."""

    id: UUID
    map_id: UUID
    name: str
    color: str
