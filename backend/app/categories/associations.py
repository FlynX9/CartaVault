from sqlalchemy import Boolean, Column, ForeignKey, Index, Table, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID

from app.database import Base


place_categories_table = Table(
    "place_categories",
    Base.metadata,
    Column(
        "place_id",
        PostgreSQLUUID(as_uuid=True),
        ForeignKey(
            "places.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    ),
    Column(
        "category_id",
        PostgreSQLUUID(as_uuid=True),
        ForeignKey(
            "categories.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    ),
    Column("is_primary", Boolean, nullable=False, server_default=text("false")),
)

Index("place_categories_one_primary_idx", place_categories_table.c.place_id, unique=True, postgresql_where=place_categories_table.c.is_primary)
