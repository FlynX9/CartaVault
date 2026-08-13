"""Allow category names to be reused with distinct icons.

Revision ID: f5c1a8d3e760
Revises: e4b9c2d6a853
"""

from alembic import op
import sqlalchemy as sa


revision = "f5c1a8d3e760"
down_revision = "e4b9c2d6a853"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("categories_map_name_key", table_name="categories")
    op.create_index(
        "categories_map_name_icon_key",
        "categories",
        ["map_id", sa.text("lower(btrim(name))"), "icon"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("categories_map_name_icon_key", table_name="categories")
    op.create_index(
        "categories_map_name_key",
        "categories",
        ["map_id", sa.text("lower(btrim(name))")],
        unique=True,
    )
