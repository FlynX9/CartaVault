from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID

from app.database import Base


place_categories_table = Table(
    "place_categories",
    Base.metadata,
    Column(
        "place_id",
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("places.id"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("categories.id"),
        primary_key=True,
    ),
)