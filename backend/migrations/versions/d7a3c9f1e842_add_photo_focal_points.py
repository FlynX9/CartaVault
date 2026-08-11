"""add normalized photo focal points

Revision ID: d7a3c9f1e842
Revises: c6f2b8e4d913
"""

from alembic import op
import sqlalchemy as sa


revision = "d7a3c9f1e842"
down_revision = "c6f2b8e4d913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("focal_x", sa.Float(), nullable=False, server_default="0.5"))
    op.add_column("photos", sa.Column("focal_y", sa.Float(), nullable=False, server_default="0.5"))
    op.create_check_constraint("photos_focal_x_range", "photos", "focal_x >= 0 AND focal_x <= 1")
    op.create_check_constraint("photos_focal_y_range", "photos", "focal_y >= 0 AND focal_y <= 1")


def downgrade() -> None:
    op.drop_constraint("photos_focal_y_range", "photos", type_="check")
    op.drop_constraint("photos_focal_x_range", "photos", type_="check")
    op.drop_column("photos", "focal_y")
    op.drop_column("photos", "focal_x")
