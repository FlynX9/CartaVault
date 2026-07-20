"""add place rating indexes

Revision ID: e3a8c1d5f720
Revises: d2f7a9c4e610
"""

from alembic import op


revision = "e3a8c1d5f720"
down_revision = "d2f7a9c4e610"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("places_map_interest_rating_idx", "places", ["map_id", "interest_rating"])
    op.create_index("places_map_visit_rating_idx", "places", ["map_id", "visit_rating"])


def downgrade() -> None:
    op.drop_index("places_map_visit_rating_idx", table_name="places")
    op.drop_index("places_map_interest_rating_idx", table_name="places")
