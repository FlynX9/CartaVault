"""Add persistent ordering to categories and tags.

Revision ID: a6d2e9f4b871
Revises: f5c1a8d3e760
"""

from alembic import op
import sqlalchemy as sa


revision = "a6d2e9f4b871"
down_revision = "f5c1a8d3e760"
branch_labels = None
depends_on = None


def _add_order(table_name: str, constraint_name: str) -> None:
    op.add_column(table_name, sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False))
    op.execute(sa.text(f"""
        WITH ranked AS (
            SELECT id, row_number() OVER (PARTITION BY map_id ORDER BY lower(name), id) * 10 AS position
            FROM {table_name}
        )
        UPDATE {table_name} AS target SET sort_order = ranked.position
        FROM ranked WHERE target.id = ranked.id
    """))
    op.create_check_constraint(constraint_name, table_name, "sort_order >= 0")


def upgrade() -> None:
    _add_order("categories", "categories_sort_order_nonnegative")
    _add_order("tags", "tags_sort_order_nonnegative")


def downgrade() -> None:
    op.drop_constraint("tags_sort_order_nonnegative", "tags", type_="check")
    op.drop_column("tags", "sort_order")
    op.drop_constraint("categories_sort_order_nonnegative", "categories", type_="check")
    op.drop_column("categories", "sort_order")
