"""Share instance API keys through quota profiles.

Revision ID: f5b8d2a4c731
Revises: e4a7c1d9b620
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f5b8d2a4c731"
down_revision: str | None = "e4a7c1d9b620"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check", "user_api_credentials",
        "provider IN ('google', 'stadia', 'mapbox', 'openrouteservice')",
    )
    op.drop_constraint("admin_api_credentials_provider_check", "admin_api_credentials", type_="check")
    op.create_check_constraint(
        "admin_api_credentials_provider_check", "admin_api_credentials",
        "provider IN ('google', 'stadia', 'mapbox', 'openrouteservice', 'resend')",
    )
    op.add_column(
        "admin_api_credentials",
        sa.Column("capabilities", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    )
    op.execute("""
        UPDATE admin_api_credentials SET capabilities = CASE provider
          WHEN 'google' THEN '["classic_basemap", "places_search", "routing", "satellite_basemap"]'::jsonb
          WHEN 'stadia' THEN '["classic_basemap", "places_search", "satellite_basemap"]'::jsonb
          WHEN 'mapbox' THEN '["satellite_basemap"]'::jsonb
          WHEN 'openrouteservice' THEN '["routing"]'::jsonb
          ELSE '[]'::jsonb END
    """)
    op.create_table(
        "quota_profile_api_credentials",
        sa.Column("quota_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("admin_api_credential_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["quota_profile_id"], ["quota_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["admin_api_credential_id"], ["admin_api_credentials.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("quota_profile_id", "admin_api_credential_id"),
    )
    op.add_column(
        "google_satellite_usage_daily",
        sa.Column("admin_credential_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "google_satellite_usage_daily_admin_credential_id_fkey",
        "google_satellite_usage_daily", "admin_api_credentials", ["admin_credential_id"], ["id"], ondelete="SET NULL",
    )
    op.drop_index("google_satellite_usage_daily_scope_key", table_name="google_satellite_usage_daily")
    op.create_index(
        "google_satellite_usage_daily_scope_key", "google_satellite_usage_daily",
        ["usage_date", "user_id", "credential_id", "admin_credential_id"], unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_index("google_satellite_usage_daily_scope_key", table_name="google_satellite_usage_daily")
    op.create_index(
        "google_satellite_usage_daily_scope_key", "google_satellite_usage_daily",
        ["usage_date", "user_id", "credential_id"], unique=True, postgresql_nulls_not_distinct=True,
    )
    op.drop_constraint("google_satellite_usage_daily_admin_credential_id_fkey", "google_satellite_usage_daily", type_="foreignkey")
    op.drop_column("google_satellite_usage_daily", "admin_credential_id")
    op.drop_table("quota_profile_api_credentials")
    op.drop_column("admin_api_credentials", "capabilities")
    op.drop_constraint("admin_api_credentials_provider_check", "admin_api_credentials", type_="check")
    op.create_check_constraint(
        "admin_api_credentials_provider_check", "admin_api_credentials",
        "provider IN ('google', 'stadia', 'openrouteservice', 'resend')",
    )
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check", "user_api_credentials",
        "provider IN ('google', 'stadia', 'openrouteservice')",
    )
