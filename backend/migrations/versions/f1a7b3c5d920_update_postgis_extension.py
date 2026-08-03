"""update PostGIS extension to the container-provided version

Revision ID: f1a7b3c5d920
Revises: e8c5a1d9f732
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op


revision: str = "f1a7b3c5d920"
down_revision: str | None = "e8c5a1d9f732"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER EXTENSION postgis UPDATE")


def downgrade() -> None:
    # Extension downgrades are not supported safely by PostgreSQL/PostGIS.
    pass
