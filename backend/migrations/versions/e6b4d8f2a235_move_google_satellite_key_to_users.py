"""move Google satellite credentials to user API keys

Revision ID: e6b4d8f2a235
Revises: d5a9c3e7f124
Create Date: 2026-08-06
"""

from collections.abc import Sequence

from alembic import op


revision: str = "e6b4d8f2a235"
down_revision: str | None = "d5a9c3e7f124"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google_routes', 'google_places', 'openrouteservice', 'google_map_tiles', 'stadia_maps', 'stadia_places')",
    )
    op.execute("DELETE FROM system_credentials WHERE provider = 'google_map_tiles'")
    op.drop_constraint("system_credentials_provider_check", "system_credentials", type_="check")
    op.create_check_constraint("system_credentials_provider_check", "system_credentials", "provider IN ('resend')")


def downgrade() -> None:
    op.execute("DELETE FROM user_api_credentials WHERE provider IN ('google_map_tiles', 'stadia_maps', 'stadia_places')")
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google_routes', 'google_places', 'openrouteservice')",
    )
    op.drop_constraint("system_credentials_provider_check", "system_credentials", type_="check")
    op.create_check_constraint(
        "system_credentials_provider_check",
        "system_credentials",
        "provider IN ('resend', 'google_map_tiles')",
    )
