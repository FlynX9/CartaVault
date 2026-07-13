from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


if TYPE_CHECKING:
    from app.places.models import Place


class Photo(Base):
    """Database representation of photo metadata."""

    __tablename__ = "photos"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    place_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey(
            "places.id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    filename: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    original_name: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    taken_at: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    place: Mapped["Place | None"] = relationship(
        back_populates="photos",
    )
