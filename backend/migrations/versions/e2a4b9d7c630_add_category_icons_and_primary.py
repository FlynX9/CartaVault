"""add category icons and primary place categories

Revision ID: e2a4b9d7c630
Revises: c4d9e7a1f220
"""
from alembic import op
import sqlalchemy as sa

revision = "e2a4b9d7c630"
down_revision = "c4d9e7a1f220"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("categories", sa.Column("icon", sa.String(50), nullable=True))
    op.execute("UPDATE categories SET icon = 'map-pin' WHERE icon IS NULL")
    op.alter_column("categories", "icon", nullable=False, server_default=sa.text("'map-pin'"))
    op.add_column("place_categories", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.execute("""WITH ranked AS (SELECT place_id, category_id, row_number() OVER (PARTITION BY place_id ORDER BY category_id) AS position FROM place_categories) UPDATE place_categories pc SET is_primary = true FROM ranked WHERE pc.place_id = ranked.place_id AND pc.category_id = ranked.category_id AND ranked.position = 1""")
    op.create_index("place_categories_one_primary_idx", "place_categories", ["place_id"], unique=True, postgresql_where=sa.text("is_primary"))

def downgrade() -> None:
    op.drop_index("place_categories_one_primary_idx", table_name="place_categories")
    op.drop_column("place_categories", "is_primary")
    op.drop_column("categories", "icon")
