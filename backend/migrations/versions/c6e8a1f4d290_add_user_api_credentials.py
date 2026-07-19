"""add encrypted user API credentials

Revision ID: c6e8a1f4d290
Revises: b2e7c4a9d531
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c6e8a1f4d290"
down_revision = "b2e7c4a9d531"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_api_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("encryption_version", sa.SmallInteger(), nullable=False),
        sa.Column("secret_last4", sa.String(length=4), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.CheckConstraint("encryption_version > 0", name="user_api_credentials_encryption_version_check"),
        sa.CheckConstraint("provider IN ('google_routes')", name="user_api_credentials_provider_check"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="user_api_credentials_user_id_fkey", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="user_api_credentials_pkey"),
        sa.UniqueConstraint("user_id", "provider", name="user_api_credentials_user_provider_key"),
    )
    op.create_index("user_api_credentials_user_id_idx", "user_api_credentials", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("user_api_credentials_user_id_idx", table_name="user_api_credentials")
    op.drop_table("user_api_credentials")
