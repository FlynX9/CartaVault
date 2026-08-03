"""add trip night photo gallery

Revision ID: b9e4c2a7d615
Revises: a5d9b2f7e410
Create Date: 2026-08-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b9e4c2a7d615"
down_revision: str | Sequence[str] | None = "a5d9b2f7e410"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trip_night_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("night_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["night_id"], ["trip_nights.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("night_id", "sort_order", name="trip_night_photos_night_order_key"),
    )
    op.create_index("trip_night_photos_night_id_idx", "trip_night_photos", ["night_id"])
    op.execute(
        """
        INSERT INTO trip_night_photos (id, night_id, file_path, mime_type, sort_order)
        SELECT photo_id, id, photo_path, photo_mime_type, 0
        FROM trip_nights
        WHERE photo_id IS NOT NULL AND photo_path IS NOT NULL AND photo_mime_type IS NOT NULL
        """
    )
    op.drop_column("trip_nights", "photo_mime_type")
    op.drop_column("trip_nights", "photo_path")
    op.drop_column("trip_nights", "photo_id")


def downgrade() -> None:
    op.add_column("trip_nights", sa.Column("photo_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trip_nights", sa.Column("photo_path", sa.Text(), nullable=True))
    op.add_column("trip_nights", sa.Column("photo_mime_type", sa.String(length=64), nullable=True))
    op.execute(
        """
        UPDATE trip_nights AS nights
        SET photo_id = photos.id,
            photo_path = photos.file_path,
            photo_mime_type = photos.mime_type
        FROM trip_night_photos AS photos
        WHERE photos.night_id = nights.id AND photos.sort_order = 0
        """
    )
    op.drop_index("trip_night_photos_night_id_idx", table_name="trip_night_photos")
    op.drop_table("trip_night_photos")
