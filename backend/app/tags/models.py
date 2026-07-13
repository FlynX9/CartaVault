from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import String, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.tags.associations import place_tags_table


if TYPE_CHECKING:
    from app.places.models import Place


class Tag(Base):
    """Database representation of a place tag."""

    __tablename__ = "tags"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        unique=True,
    )

    places: Mapped[list["Place"]] = relationship(
        secondary=place_tags_table,
        back_populates="tags",
    )
