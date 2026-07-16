from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class TagCreate(BaseModel):
    """Data accepted when creating a tag."""

    name: str = Field(
        min_length=1,
        max_length=100,
    )
    map_id: UUID

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        """Normalize surrounding whitespace before length validation."""

        return value.strip() if isinstance(value, str) else value


class TagUpdate(BaseModel):
    """Data accepted when partially updating a tag."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        """Normalize surrounding whitespace before length validation."""

        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_name(self) -> Self:
        """Prevent the mandatory name from being explicitly cleared."""

        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("The tag name cannot be null")

        return self


class TagRead(BaseModel):
    """Public representation of a tag."""

    id: UUID
    map_id: UUID
    name: str
