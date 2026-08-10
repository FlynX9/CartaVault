"""align media and TOTP schema

Revision ID: fa1e7c2d4b90
Revises: a4e8b2c6d913
"""

from alembic import op


revision = "fa1e7c2d4b90"
down_revision = "a4e8b2c6d913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Unassigned uploads are a supported media-workspace state.  The original
    # migration backfilled legacy rows then made both values non-null; restore
    # the intended contract without rewriting an already released revision.
    op.alter_column("photos", "map_id", nullable=True)
    op.alter_column("photos", "storage_scope_id", nullable=True)


def downgrade() -> None:
    # Existing unassigned media must be attached or removed before downgrade.
    op.alter_column("photos", "storage_scope_id", nullable=False)
    op.alter_column("photos", "map_id", nullable=False)
