"""remove obsolete dedicated place chronology fields

Revision ID: c6f2b8e4d913
Revises: c5e1a9d2f731
"""

from alembic import op
import sqlalchemy as sa


revision = "c6f2b8e4d913"
down_revision = "c5e1a9d2f731"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("places", "construction_date")
    op.drop_column("places", "abandonment_date")


def downgrade() -> None:
    op.add_column("places", sa.Column("construction_date", sa.String(length=100), nullable=True))
    op.add_column("places", sa.Column("abandonment_date", sa.String(length=100), nullable=True))
