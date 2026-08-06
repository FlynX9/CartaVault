"""allow per-user OpenRouteService credentials

Revision ID: c4f8a2d6e913
Revises: b3e7c9a1d540
Create Date: 2026-08-06
"""

from collections.abc import Sequence

from alembic import op


revision: str = "c4f8a2d6e913"
down_revision: str | None = "b3e7c9a1d540"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google_routes', 'google_places', 'openrouteservice')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM user_api_credentials WHERE provider = 'openrouteservice'")
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint(
        "user_api_credentials_provider_check",
        "user_api_credentials",
        "provider IN ('google_routes', 'google_places')",
    )
