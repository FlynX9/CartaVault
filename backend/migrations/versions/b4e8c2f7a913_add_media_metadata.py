"""add media metadata

Revision ID: b4e8c2f7a913
Revises: f1e6a4c8d920
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b4e8c2f7a913"
down_revision: str | None = "f1e6a4c8d920"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("mime_type", sa.String(length=64), nullable=True))
    op.add_column("photos", sa.Column("file_size_bytes", sa.BigInteger(), nullable=True))
    op.add_column("photos", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("photos", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column(
        "photos",
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "photos",
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_foreign_key(
        "photos_uploaded_by_user_id_fkey",
        "photos",
        "users",
        ["uploaded_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "photos_file_size_nonnegative",
        "photos",
        "file_size_bytes IS NULL OR file_size_bytes >= 0",
    )
    op.create_check_constraint(
        "photos_width_positive",
        "photos",
        "width IS NULL OR width > 0",
    )
    op.create_check_constraint(
        "photos_height_positive",
        "photos",
        "height IS NULL OR height > 0",
    )
    op.create_index("photos_created_at_idx", "photos", ["created_at"])
    op.create_index(
        "photos_uploaded_by_user_id_idx",
        "photos",
        ["uploaded_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("photos_uploaded_by_user_id_idx", table_name="photos")
    op.drop_index("photos_created_at_idx", table_name="photos")
    op.drop_constraint("photos_height_positive", "photos", type_="check")
    op.drop_constraint("photos_width_positive", "photos", type_="check")
    op.drop_constraint("photos_file_size_nonnegative", "photos", type_="check")
    op.drop_constraint(
        "photos_uploaded_by_user_id_fkey",
        "photos",
        type_="foreignkey",
    )
    op.drop_column("photos", "updated_at")
    op.drop_column("photos", "uploaded_by_user_id")
    op.drop_column("photos", "height")
    op.drop_column("photos", "width")
    op.drop_column("photos", "file_size_bytes")
    op.drop_column("photos", "mime_type")
