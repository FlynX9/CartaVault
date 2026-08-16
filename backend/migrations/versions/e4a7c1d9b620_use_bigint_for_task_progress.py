"""use bigint for background task progress

Revision ID: e4a7c1d9b620
Revises: d3f6b9c2e851
Create Date: 2026-08-17
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e4a7c1d9b620"
down_revision: str | Sequence[str] | None = "d3f6b9c2e851"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "background_tasks",
        "progress_current",
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
    )
    op.alter_column(
        "background_tasks",
        "progress_total",
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        existing_nullable=False,
        existing_server_default=sa.text("1"),
    )


def downgrade() -> None:
    # Preserve a usable task history if a downgrade is explicitly requested.
    # Values outside INTEGER's range cannot be represented by the parent
    # schema, so cap counters before narrowing the columns.
    op.execute(
        "UPDATE background_tasks SET "
        "progress_current = LEAST(progress_current, 2147483647), "
        "progress_total = LEAST(progress_total, 2147483647)"
    )
    op.alter_column(
        "background_tasks",
        "progress_total",
        existing_type=sa.BigInteger(),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default=sa.text("1"),
    )
    op.alter_column(
        "background_tasks",
        "progress_current",
        existing_type=sa.BigInteger(),
        type_=sa.Integer(),
        existing_nullable=False,
        existing_server_default=sa.text("0"),
    )
