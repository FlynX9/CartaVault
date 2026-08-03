"""remove raw night import source

Revision ID: d7b4c9e1a620
Revises: c3a7e9d2f614
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op


revision: str = "d7b4c9e1a620"
down_revision: str | Sequence[str] | None = "c3a7e9d2f614"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE trip_nights SET source_type = 'map' WHERE source_type = 'imported_text'")
    op.drop_constraint("trip_nights_source_type_check", "trip_nights", type_="check")
    op.create_check_constraint("trip_nights_source_type_check", "trip_nights", "source_type IN ('place', 'map')")


def downgrade() -> None:
    op.drop_constraint("trip_nights_source_type_check", "trip_nights", type_="check")
    op.create_check_constraint("trip_nights_source_type_check", "trip_nights", "source_type IN ('place', 'map', 'imported_text')")
