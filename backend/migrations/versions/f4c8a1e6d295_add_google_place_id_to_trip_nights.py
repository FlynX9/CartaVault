"""add Google Places identity to trip nights

Revision ID: f4c8a1e6d295
Revises: e3a7c9d2f411
"""

import sqlalchemy as sa
from alembic import op


revision = "f4c8a1e6d295"
down_revision = "e3a7c9d2f411"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trip_nights", sa.Column("google_place_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("trip_nights", "google_place_id")
