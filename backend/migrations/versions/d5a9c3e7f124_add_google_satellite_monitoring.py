"""add Google satellite credential and privacy-safe monitoring

Revision ID: d5a9c3e7f124
Revises: c4f8a2d6e913
Create Date: 2026-08-06
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d5a9c3e7f124"
down_revision: str | None = "c4f8a2d6e913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("system_credentials_provider_check", "system_credentials", type_="check")
    op.create_check_constraint("system_credentials_provider_check", "system_credentials", "provider IN ('resend', 'google_map_tiles')")
    op.create_table(
        "google_satellite_usage_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sessions_started", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("tiles_started", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("tiles_completed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("tiles_failed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("tiles_cancelled", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usage_date", "user_id", name="google_satellite_usage_daily_date_user_key"),
    )
    op.create_index("google_satellite_usage_daily_date_idx", "google_satellite_usage_daily", ["usage_date"])


def downgrade() -> None:
    op.drop_index("google_satellite_usage_daily_date_idx", table_name="google_satellite_usage_daily")
    op.drop_table("google_satellite_usage_daily")
    op.execute("DELETE FROM system_credentials WHERE provider = 'google_map_tiles'")
    op.drop_constraint("system_credentials_provider_check", "system_credentials", type_="check")
    op.create_check_constraint("system_credentials_provider_check", "system_credentials", "provider IN ('resend')")
