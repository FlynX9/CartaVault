"""remove address and owner from places

Revision ID: 00e9ed556b82
Revises: 502f671a968a
Create Date: 2026-07-13 15:54:16.600124

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00e9ed556b82'
down_revision: Union[str, Sequence[str], None] = '502f671a968a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove obsolete place fields and their stored values."""
    op.drop_column("places", "address")
    op.drop_column("places", "owner")


def downgrade() -> None:
    """Recreate columns without restoring values lost by the upgrade."""
    op.add_column(
        "places",
        sa.Column("address", sa.Text(), nullable=True),
    )
    op.add_column(
        "places",
        sa.Column("owner", sa.String(length=255), nullable=True),
    )
