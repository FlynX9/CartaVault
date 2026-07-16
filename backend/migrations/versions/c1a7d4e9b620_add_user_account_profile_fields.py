"""add user account profile fields

Revision ID: c1a7d4e9b620
Revises: e5b9c3d1a742
"""
from alembic import op
import sqlalchemy as sa

revision = "c1a7d4e9b620"
down_revision = "e5b9c3d1a742"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_filename", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("avatar_updated_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))

def downgrade() -> None:
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "avatar_filename")
