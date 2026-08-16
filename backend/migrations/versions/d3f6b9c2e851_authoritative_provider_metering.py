"""authoritative provider metering and provider quota profiles

Revision ID: d3f6b9c2e851
Revises: c2e5a8b1d940
Create Date: 2026-08-16
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d3f6b9c2e851"
down_revision: str | Sequence[str] | None = "c2e5a8b1d940"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE system_settings SET value = jsonb_set(value, '{enabled}', 'true'::jsonb) "
        "WHERE key = 'google_satellite' AND value->>'disabled_reason' = 'USAGE_THRESHOLD_REACHED'"
    )
    op.add_column("quota_profiles", sa.Column("google_satellite_tiles_daily_max", sa.Integer(), nullable=True))
    op.add_column("quota_profiles", sa.Column("google_satellite_tiles_monthly_max", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "quota_profiles_google_satellite_tiles_daily_max_nonnegative",
        "quota_profiles",
        "google_satellite_tiles_daily_max IS NULL OR google_satellite_tiles_daily_max >= 0",
    )
    op.create_check_constraint(
        "quota_profiles_google_satellite_tiles_monthly_max_nonnegative",
        "quota_profiles",
        "google_satellite_tiles_monthly_max IS NULL OR google_satellite_tiles_monthly_max >= 0",
    )

    op.add_column("trip_night_photos", sa.Column("file_size_bytes", sa.BigInteger(), server_default=sa.text("0"), nullable=False))
    op.create_check_constraint("trip_night_photos_file_size_nonnegative", "trip_night_photos", "file_size_bytes >= 0")

    op.drop_constraint("google_satellite_usage_daily_date_user_key", "google_satellite_usage_daily", type_="unique")
    op.add_column("google_satellite_usage_daily", sa.Column("credential_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("google_satellite_usage_daily", sa.Column("quota_profile_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "google_satellite_usage_daily_credential_id_fkey",
        "google_satellite_usage_daily",
        "user_api_credentials",
        ["credential_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "google_satellite_usage_daily_quota_profile_id_fkey",
        "google_satellite_usage_daily",
        "quota_profiles",
        ["quota_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        "UPDATE google_satellite_usage_daily AS usage "
        "SET quota_profile_id = users.quota_profile_id "
        "FROM users WHERE users.id = usage.user_id"
    )
    op.create_index(
        "google_satellite_usage_daily_scope_key",
        "google_satellite_usage_daily",
        ["usage_date", "user_id", "credential_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_index("google_satellite_usage_daily_scope_key", table_name="google_satellite_usage_daily")
    op.drop_constraint("google_satellite_usage_daily_quota_profile_id_fkey", "google_satellite_usage_daily", type_="foreignkey")
    op.drop_constraint("google_satellite_usage_daily_credential_id_fkey", "google_satellite_usage_daily", type_="foreignkey")
    op.drop_column("google_satellite_usage_daily", "quota_profile_id")
    op.drop_column("google_satellite_usage_daily", "credential_id")
    op.create_unique_constraint(
        "google_satellite_usage_daily_date_user_key",
        "google_satellite_usage_daily",
        ["usage_date", "user_id"],
    )

    op.drop_constraint("trip_night_photos_file_size_nonnegative", "trip_night_photos", type_="check")
    op.drop_column("trip_night_photos", "file_size_bytes")

    op.drop_constraint("quota_profiles_google_satellite_tiles_monthly_max_nonnegative", "quota_profiles", type_="check")
    op.drop_constraint("quota_profiles_google_satellite_tiles_daily_max_nonnegative", "quota_profiles", type_="check")
    op.drop_column("quota_profiles", "google_satellite_tiles_monthly_max")
    op.drop_column("quota_profiles", "google_satellite_tiles_daily_max")
