"""store API key test error details

Revision ID: c2f7a9e4d631
Revises: b1e4c8d2f690
"""

from alembic import op
import sqlalchemy as sa


revision = "c2f7a9e4d631"
down_revision = "b1e4c8d2f690"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_api_credentials", sa.Column("last_error_status", sa.SmallInteger(), nullable=True))
    op.add_column("user_api_credentials", sa.Column("last_error_message", sa.Text(), nullable=True))
    op.add_column("user_api_credentials", sa.Column("last_error_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_api_credentials", "last_error_at")
    op.drop_column("user_api_credentials", "last_error_message")
    op.drop_column("user_api_credentials", "last_error_status")
