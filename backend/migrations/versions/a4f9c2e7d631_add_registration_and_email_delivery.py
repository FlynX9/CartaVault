"""add registration approval and email delivery storage

Revision ID: a4f9c2e7d631
Revises: e3a8c1d5f720
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a4f9c2e7d631"
down_revision = "e3a8c1d5f720"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registration_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notification_sent_at", sa.DateTime(), nullable=True),
        sa.Column("notification_error_code", sa.String(64), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="registration_requests_status_check"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="registration_requests_email_key"),
    )
    op.create_index("registration_requests_status_created_idx", "registration_requests", ["status", "created_at"])
    op.create_table(
        "auth_action_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_type", sa.String(32), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("token_type IN ('password_reset')", name="auth_action_tokens_type_check"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("auth_action_tokens_token_hash_key", "auth_action_tokens", ["token_hash"], unique=True)
    op.create_index("auth_action_tokens_user_type_idx", "auth_action_tokens", ["user_id", "token_type"])
    op.create_index("auth_action_tokens_expires_at_idx", "auth_action_tokens", ["expires_at"])
    op.create_table(
        "system_credentials",
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("encryption_version", sa.SmallInteger(), nullable=False),
        sa.Column("secret_last4", sa.String(4), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provider IN ('resend')", name="system_credentials_provider_check"),
        sa.CheckConstraint("encryption_version > 0", name="system_credentials_encryption_version_check"),
        sa.PrimaryKeyConstraint("provider"),
    )


def downgrade() -> None:
    op.drop_table("system_credentials")
    op.drop_index("auth_action_tokens_expires_at_idx", table_name="auth_action_tokens")
    op.drop_index("auth_action_tokens_user_type_idx", table_name="auth_action_tokens")
    op.drop_index("auth_action_tokens_token_hash_key", table_name="auth_action_tokens")
    op.drop_table("auth_action_tokens")
    op.drop_index("registration_requests_status_created_idx", table_name="registration_requests")
    op.drop_table("registration_requests")
