"""allow separate Google Places credentials

Revision ID: e3a7c9d2f411
Revises: d1f4a8c2e730
"""

from alembic import op


revision = "e3a7c9d2f411"
down_revision = "d1f4a8c2e730"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint("user_api_credentials_provider_check", "user_api_credentials", "provider IN ('google_routes', 'google_places')")


def downgrade() -> None:
    op.execute("DELETE FROM user_api_credentials WHERE provider = 'google_places'")
    op.drop_constraint("user_api_credentials_provider_check", "user_api_credentials", type_="check")
    op.create_check_constraint("user_api_credentials_provider_check", "user_api_credentials", "provider IN ('google_routes')")
