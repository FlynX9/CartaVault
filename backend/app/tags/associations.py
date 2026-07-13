from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID

from app.database import Base


place_tags_table = Table(
    "place_tags",
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
        "tag_id",
        PostgreSQLUUID(as_uuid=True),
        ForeignKey(
            "tags.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    ),
)
