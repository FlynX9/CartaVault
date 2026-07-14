from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.categories.icon_catalog import (
    DEFAULT_CATEGORY_ICON_ID,
    is_allowed_category_icon,
)


class CategoryCreate(BaseModel):
    """Data accepted when creating a category."""

    name: str = Field(
        min_length=1,
        max_length=100,
    )

    description: str | None = None
    icon: str = DEFAULT_CATEGORY_ICON_ID

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: str) -> str:
        normalized = value.strip()
        if not is_allowed_category_icon(normalized):
            raise ValueError("The category icon is not allowed")
        return normalized


class CategoryUpdate(BaseModel):
    """Data accepted when partially updating a category."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    description: str | None = None
    icon: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> Self:
        """Prevent the mandatory name from being explicitly cleared."""

        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("The category name cannot be null")
        if "icon" in self.model_fields_set and self.icon is None:
            raise ValueError("The category icon cannot be null")

        return self

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not is_allowed_category_icon(normalized):
            raise ValueError("The category icon is not allowed")
        return normalized


class CategoryRead(BaseModel):
    """Public representation of a category."""

    id: UUID
    name: str
    description: str | None
    icon: str
