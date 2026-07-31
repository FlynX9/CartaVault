"""add ownership transfer invitations

Revision ID: d1f4a8c2e730
Revises: c2e8f4a6b913
Create Date: 2026-07-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d1f4a8c2e730"
down_revision: str | None = "c2e8f4a6b913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_constraint("map_invitations_role_check", "map_invitations", type_="check")
    op.create_check_constraint("map_invitations_role_check", "map_invitations", "role IN ('owner', 'editor', 'viewer')")
    op.create_index(
        "map_invitations_one_pending_owner_idx",
        "map_invitations",
        ["map_id"],
        unique=True,
        postgresql_where=sa.text("role = 'owner' AND accepted_at IS NULL AND revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("map_invitations_one_pending_owner_idx", table_name="map_invitations")
    op.execute("UPDATE map_invitations SET revoked_at = now() WHERE role = 'owner' AND accepted_at IS NULL AND revoked_at IS NULL")
    op.execute("DELETE FROM map_invitations WHERE role = 'owner'")
    op.drop_constraint("map_invitations_role_check", "map_invitations", type_="check")
    op.create_check_constraint("map_invitations_role_check", "map_invitations", "role IN ('editor', 'viewer')")
