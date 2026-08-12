"""remove archived quota profiles

Revision ID: fc3b7d9e1a620
Revises: fb2a6c8d4e915
"""

from alembic import op


revision = "fc3b7d9e1a620"
down_revision = "fb2a6c8d4e915"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Archived profiles were never assignable and can now be removed safely.
    op.execute("DELETE FROM quota_profiles WHERE is_active = false")


def downgrade() -> None:
    # Deleted archived profiles are intentionally not recreated.
    pass
