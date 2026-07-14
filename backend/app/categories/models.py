from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.categories.associations import place_categories_table
from app.database import Base


if TYPE_CHECKING:
    from app.places.models import Place


class Category(Base):
    """Database representation of a place category."""

    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    places: Mapped[list["Place"]] = relationship(
        secondary=place_categories_table,
        back_populates="categories",
    )

    icon: Mapped[str] = mapped_column(String(50), nullable=False, server_default=text("'map-pin'"))
