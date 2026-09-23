"""add background task recovery lease columns

Revision ID: c9f2a4d81e57
Revises: ff6c2b8d3e01
Create Date: 2026-08-29

Adds the crash-recovery lease used to give a running background task a
temporary owner and a bounded staleness window. Both columns are nullable so
existing rows remain valid; a NULL lease simply means the task is unowned and
eligible for recovery.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c9f2a4d81e57"
down_revision: str | None = "ff6c2b8d3e01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("background_tasks", sa.Column("lease_owner", sa.String(120), nullable=True))
    op.add_column("background_tasks", sa.Column("lease_expires_at", sa.DateTime(), nullable=True))
    op.create_index(
        "background_tasks_recovery_idx",
        "background_tasks",
        ["status", "lease_expires_at"],
        postgresql_where=sa.text("status = 'running'"),
    )


def downgrade() -> None:
    op.drop_index("background_tasks_recovery_idx", table_name="background_tasks", postgresql_where=sa.text("status = 'running'"))
    op.drop_column("background_tasks", "lease_expires_at")
    op.drop_column("background_tasks", "lease_owner")
