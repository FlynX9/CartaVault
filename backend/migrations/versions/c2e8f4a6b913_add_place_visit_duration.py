"""add optional place visit duration

Revision ID: c2e8f4a6b913
Revises: b8d2e5f7c310
Create Date: 2026-07-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c2e8f4a6b913"
down_revision: str | None = "b8d2e5f7c310"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("places", sa.Column("default_visit_duration_minutes", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "places_default_visit_duration_check",
        "places",
        "default_visit_duration_minutes IS NULL OR (default_visit_duration_minutes >= 0 AND default_visit_duration_minutes <= 1440)",
    )


def downgrade() -> None:
    op.drop_constraint("places_default_visit_duration_check", "places", type_="check")
    op.drop_column("places", "default_visit_duration_minutes")
