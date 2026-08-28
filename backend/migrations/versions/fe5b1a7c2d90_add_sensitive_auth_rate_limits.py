"""add persistent sensitive authentication rate limits

Revision ID: fe5b1a7c2d90
Revises: fd4e8a2b7c91
"""

import sqlalchemy as sa
from alembic import op


revision = "fe5b1a7c2d90"
down_revision = "fd4e8a2b7c91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("sensitive_auth_failure_count", sa.SmallInteger(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("sensitive_auth_failure_window_started_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("email_mfa_last_sent_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("email_mfa_send_count", sa.SmallInteger(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("email_mfa_send_window_started_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "email_mfa_send_window_started_at")
    op.drop_column("users", "email_mfa_send_count")
    op.drop_column("users", "email_mfa_last_sent_at")
    op.drop_column("users", "sensitive_auth_failure_window_started_at")
    op.drop_column("users", "sensitive_auth_failure_count")
