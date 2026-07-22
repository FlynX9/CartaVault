"""add admin instance settings

Revision ID: e7a4c1d9b620
Revises: d6f1a3b8c902
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e7a4c1d9b620"
down_revision = "d6f1a3b8c902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.add_column("system_credentials", sa.Column("verified_at", sa.DateTime(), nullable=True))
    op.add_column("system_credentials", sa.Column("last_used_at", sa.DateTime(), nullable=True))
    op.add_column("system_credentials", sa.Column("last_error_code", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("system_credentials", "last_error_code")
    op.drop_column("system_credentials", "last_used_at")
    op.drop_column("system_credentials", "verified_at")
    op.drop_table("system_settings")
