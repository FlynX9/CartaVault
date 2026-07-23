"""add registration locale

Revision ID: c7a2e5d9f814
Revises: b4e8c2f7a913
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c7a2e5d9f814"
down_revision: str | None = "b4e8c2f7a913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "registration_requests",
        sa.Column("locale", sa.String(length=2), server_default=sa.text("'fr'"), nullable=False),
    )
    op.create_check_constraint(
        "registration_requests_locale_check",
        "registration_requests",
        "locale IN ('fr', 'en')",
    )


def downgrade() -> None:
    op.drop_constraint("registration_requests_locale_check", "registration_requests", type_="check")
    op.drop_column("registration_requests", "locale")
