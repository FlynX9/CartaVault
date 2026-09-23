"""add per-claim task fencing token

Revision ID: e1a4c7d9f203
Revises: d0b7e3f91a62
Create Date: 2026-08-30

The owner string identifies a worker for diagnostics, but can be reused by a
restarted process.  A fresh UUID for every lease acquisition lets all worker
heartbeats, commits and terminal transitions be fenced to one claim.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e1a4c7d9f203"
down_revision: str | None = "d0b7e3f91a62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "background_tasks",
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("background_tasks", "lease_token")
