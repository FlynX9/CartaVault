"""add tag colors

Revision ID: d8b3f1a6c902
Revises: c7a2e5d9f814
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d8b3f1a6c902"
down_revision: str | None = "c7a2e5d9f814"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tags",
        sa.Column(
            "color",
            sa.String(length=7),
            server_default=sa.text("'#0FA68A'"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "tags_color_format",
        "tags",
        "color ~ '^#[0-9A-F]{6}$'",
    )


def downgrade() -> None:
    op.drop_constraint("tags_color_format", "tags", type_="check")
    op.drop_column("tags", "color")
