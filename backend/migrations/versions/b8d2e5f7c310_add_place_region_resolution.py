"""add place region resolution metadata

Revision ID: b8d2e5f7c310
Revises: a7c1d9e4b206
Create Date: 2026-07-30
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b8d2e5f7c310"
down_revision: str | None = "a7c1d9e4b206"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("places", sa.Column("country", sa.String(length=120), nullable=True))
    op.add_column("places", sa.Column("country_code", sa.String(length=2), nullable=True))
    op.add_column("places", sa.Column("region_type", sa.String(length=40), nullable=True))
    op.add_column("places", sa.Column("region_code", sa.String(length=40), nullable=True))
    op.add_column("places", sa.Column("region_admin_level", sa.SmallInteger(), nullable=True))
    op.add_column("places", sa.Column("region_source", sa.String(length=40), nullable=True))
    op.add_column("places", sa.Column("region_resolved_at", sa.DateTime(), nullable=True))
    op.add_column(
        "places",
        sa.Column(
            "region_manually_overridden",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE places
        SET region_manually_overridden = true,
            region_source = 'manual'
        WHERE region IS NOT NULL AND btrim(region) <> ''
        """
    )


def downgrade() -> None:
    op.drop_column("places", "region_manually_overridden")
    op.drop_column("places", "region_resolved_at")
    op.drop_column("places", "region_source")
    op.drop_column("places", "region_admin_level")
    op.drop_column("places", "region_code")
    op.drop_column("places", "region_type")
    op.drop_column("places", "country_code")
    op.drop_column("places", "country")
