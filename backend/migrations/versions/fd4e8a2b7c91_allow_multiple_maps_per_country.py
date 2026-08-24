"""allow multiple active maps per owner and country

Revision ID: fd4e8a2b7c91
Revises: fc3b7d9e1a620
"""

from alembic import op


revision = "fd4e8a2b7c91"
down_revision = "fc3b7d9e1a620"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("poi_maps_owner_country_active_key", table_name="poi_maps")


def downgrade() -> None:
    op.create_index(
        "poi_maps_owner_country_active_key",
        "poi_maps",
        ["owner_id", "country_id"],
        unique=True,
        postgresql_where="deleted_at IS NULL",
    )
