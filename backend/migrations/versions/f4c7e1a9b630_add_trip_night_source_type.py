"""add trip night source type

Revision ID: f4c7e1a9b630
Revises: e7a4c1d9b620
Create Date: 2026-07-27
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f4c7e1a9b630"
down_revision: str | None = "e7a4c1d9b620"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("trip_nights", sa.Column("source_type", sa.String(length=24), server_default=sa.text("'map'"), nullable=False))
    op.execute("UPDATE trip_nights SET source_type = 'place' WHERE place_id IS NOT NULL")
    op.create_check_constraint("trip_nights_source_type_check", "trip_nights", "source_type IN ('place', 'map', 'imported_text')")


def downgrade() -> None:
    op.drop_constraint("trip_nights_source_type_check", "trip_nights", type_="check")
    op.drop_column("trip_nights", "source_type")
