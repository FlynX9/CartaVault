"""add photo order and primary

Revision ID: c4d9e7a1f220
Revises: b7e3a91d4c20
"""

from alembic import op
import sqlalchemy as sa

revision = "c4d9e7a1f220"
down_revision = "b7e3a91d4c20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.add_column("photos", sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("""
        WITH numbered AS (
            SELECT id, row_number() OVER (PARTITION BY place_id ORDER BY created_at, id) - 1 AS position
            FROM photos
        )
        UPDATE photos SET sort_order = numbered.position FROM numbered WHERE photos.id = numbered.id
    """)
    op.alter_column("photos", "sort_order", nullable=False, server_default=sa.text("0"))
    op.execute("""
        WITH first_photos AS (
            SELECT DISTINCT ON (place_id) id FROM photos WHERE place_id IS NOT NULL ORDER BY place_id, sort_order, id
        )
        UPDATE photos SET is_primary = true FROM first_photos WHERE photos.id = first_photos.id
    """)
    op.create_check_constraint("photos_sort_order_nonnegative", "photos", "sort_order >= 0")
    op.create_index("photos_place_sort_order_key", "photos", ["place_id", "sort_order"], unique=True)
    op.create_index("photos_one_primary_per_place_idx", "photos", ["place_id"], unique=True, postgresql_where=sa.text("is_primary"))


def downgrade() -> None:
    op.drop_index("photos_one_primary_per_place_idx", table_name="photos")
    op.drop_index("photos_place_sort_order_key", table_name="photos")
    op.drop_constraint("photos_sort_order_nonnegative", "photos", type_="check")
    op.drop_column("photos", "is_primary")
    op.drop_column("photos", "sort_order")
