"""add retained user activity audit events

Revision ID: a1d8f4e2c6b0
Revises: fc3b7d9e1a620
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a1d8f4e2c6b0"
down_revision = "fc3b7d9e1a620"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_activity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("previous_value", sa.String(length=160), nullable=True),
        sa.Column("next_value", sa.String(length=160), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("user_activity_events_user_occurred_idx", "user_activity_events", ["user_id", "occurred_at"], unique=False)


def downgrade() -> None:
    op.drop_index("user_activity_events_user_occurred_idx", table_name="user_activity_events")
    op.drop_table("user_activity_events")
