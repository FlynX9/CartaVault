"""add trip night stay details

Revision ID: c3a7e9d2f614
Revises: b9e4c2a7d615
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c3a7e9d2f614"
down_revision: str | Sequence[str] | None = "b9e4c2a7d615"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("trip_nights", sa.Column("website_url", sa.String(length=2048), nullable=True))
    op.add_column("trip_nights", sa.Column("check_in_from_time", sa.Time(), nullable=True))
    op.add_column("trip_nights", sa.Column("check_in_until_time", sa.Time(), nullable=True))
    op.add_column("trip_nights", sa.Column("check_out_from_time", sa.Time(), nullable=True))
    op.add_column("trip_nights", sa.Column("check_out_until_time", sa.Time(), nullable=True))
    op.execute("UPDATE trip_nights SET check_in_until_time = check_in_time, check_out_until_time = check_out_time")
    op.drop_column("trip_nights", "check_in_time")
    op.drop_column("trip_nights", "check_out_time")


def downgrade() -> None:
    op.add_column("trip_nights", sa.Column("check_in_time", sa.Time(), nullable=True))
    op.add_column("trip_nights", sa.Column("check_out_time", sa.Time(), nullable=True))
    op.execute("UPDATE trip_nights SET check_in_time = check_in_until_time, check_out_time = check_out_until_time")
    op.drop_column("trip_nights", "check_out_until_time")
    op.drop_column("trip_nights", "check_out_from_time")
    op.drop_column("trip_nights", "check_in_until_time")
    op.drop_column("trip_nights", "check_in_from_time")
    op.drop_column("trip_nights", "website_url")
