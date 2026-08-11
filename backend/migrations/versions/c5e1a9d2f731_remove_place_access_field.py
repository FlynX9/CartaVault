"""remove obsolete dedicated place access field

Revision ID: c5e1a9d2f731
Revises: c3a9d4e8f210
"""

from alembic import op
import sqlalchemy as sa


revision = "c5e1a9d2f731"
down_revision = "c3a9d4e8f210"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("places", "access")


def downgrade() -> None:
    op.add_column("places", sa.Column("access", sa.String(length=50), nullable=True))
