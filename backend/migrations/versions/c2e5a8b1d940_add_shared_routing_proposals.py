"""add shared routing optimization proposals

Revision ID: c2e5a8b1d940
Revises: b1f4c8a2d730
Create Date: 2026-08-16
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c2e5a8b1d940"
down_revision: str | Sequence[str] | None = "b1f4c8a2d730"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "routing_optimization_proposals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "routing_optimization_proposals_expires_at_idx",
        "routing_optimization_proposals",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "routing_optimization_proposals_expires_at_idx",
        table_name="routing_optimization_proposals",
    )
    op.drop_table("routing_optimization_proposals")
