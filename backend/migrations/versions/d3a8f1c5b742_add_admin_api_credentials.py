"""add admin api credentials

Revision ID: d3a8f1c5b742
Revises: c2f7a9e4d631
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d3a8f1c5b742"
down_revision = "c2f7a9e4d631"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_api_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("encryption_version", sa.SmallInteger(), nullable=False),
        sa.Column("secret_last4", sa.String(length=4), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("last_error_status", sa.SmallInteger(), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("last_error_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("provider IN ('google', 'stadia', 'resend')", name="admin_api_credentials_provider_check"),
        sa.CheckConstraint("encryption_version > 0", name="admin_api_credentials_encryption_version_check"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("admin_api_credentials_provider_idx", "admin_api_credentials", ["provider"])
    op.execute("""
        INSERT INTO admin_api_credentials (provider, name, encrypted_secret, encryption_version, secret_last4, created_at, updated_at, verified_at, last_used_at, last_error_code)
        SELECT provider, 'Resend', encrypted_secret, encryption_version, secret_last4, created_at, updated_at, verified_at, last_used_at, last_error_code
        FROM system_credentials WHERE provider = 'resend'
    """)


def downgrade() -> None:
    op.drop_index("admin_api_credentials_provider_idx", table_name="admin_api_credentials")
    op.drop_table("admin_api_credentials")
