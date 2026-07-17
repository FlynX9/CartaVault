"""add trip day colors

Revision ID: f6b2c8e4a719
Revises: d4a8e6c2f913
"""
from alembic import op
import sqlalchemy as sa


revision = "f6b2c8e4a719"
down_revision = "d4a8e6c2f913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trip_days", sa.Column("color", sa.String(7), server_default=sa.text("'#0FA68A'"), nullable=False))
    op.execute(
        """
        WITH ordered_days AS (
            SELECT id, (row_number() OVER (PARTITION BY trip_id ORDER BY sort_order) - 1) % 8 AS color_index
            FROM trip_days
        )
        UPDATE trip_days AS day
        SET color = CASE ordered_days.color_index
            WHEN 0 THEN '#0FA68A'
            WHEN 1 THEN '#2563EB'
            WHEN 2 THEN '#9333EA'
            WHEN 3 THEN '#D97706'
            WHEN 4 THEN '#DC2626'
            WHEN 5 THEN '#0891B2'
            WHEN 6 THEN '#65A30D'
            ELSE '#DB2777'
        END
        FROM ordered_days
        WHERE day.id = ordered_days.id
        """
    )
    op.create_check_constraint("trip_days_color_check", "trip_days", "color ~ '^#[0-9A-Fa-f]{6}$'")


def downgrade() -> None:
    op.drop_constraint("trip_days_color_check", "trip_days", type_="check")
    op.drop_column("trip_days", "color")
