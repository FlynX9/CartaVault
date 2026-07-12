from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CategoryCreate(BaseModel):
    """Data accepted when creating a category."""

    name: str = Field(
        min_length=1,
        max_length=100,
    )

    description: str | None = None


class CategoryUpdate(BaseModel):
    """Data accepted when partially updating a category."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    description: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> Self:
        """Prevent the mandatory name from being explicitly cleared."""

        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("The category name cannot be null")

        return self


class CategoryRead(BaseModel):
    """Public representation of a category."""

    id: UUID
    name: str
    description: str | None