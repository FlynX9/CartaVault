"""add custom fields to places

Revision ID: a91d3b6e7f24
Revises: f3a7c1d9e842
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a91d3b6e7f24"
down_revision = "f3a7c1d9e842"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "places",
        sa.Column(
            "custom_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("places", "custom_fields")
