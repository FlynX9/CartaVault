"""add trip night details

Revision ID: a5d9b2f7e410
Revises: f4c8a1e6d295
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a5d9b2f7e410"
down_revision: str | Sequence[str] | None = "f4c8a1e6d295"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("trip_nights", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("trip_nights", sa.Column("photo_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trip_nights", sa.Column("photo_path", sa.Text(), nullable=True))
    op.add_column("trip_nights", sa.Column("photo_mime_type", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("trip_nights", "photo_mime_type")
    op.drop_column("trip_nights", "photo_path")
    op.drop_column("trip_nights", "photo_id")
    op.drop_column("trip_nights", "description")
