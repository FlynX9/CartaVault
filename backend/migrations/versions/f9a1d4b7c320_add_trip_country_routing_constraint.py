"""add per-trip country routing constraint

Revision ID: f9a1d4b7c320
Revises: f7b4c9d2e610
"""
from alembic import op
import sqlalchemy as sa

revision = "f9a1d4b7c320"
down_revision = "f7b4c9d2e610"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("stay_in_country", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("trips", "stay_in_country")
