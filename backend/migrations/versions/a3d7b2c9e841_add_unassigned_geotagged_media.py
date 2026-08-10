"""add unassigned geotagged media

Revision ID: a3d7b2c9e841
Revises: a1c5e8f2b740
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a3d7b2c9e841"
down_revision = "a1c5e8f2b740"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("photos", sa.Column("storage_scope_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("photos", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("photos", sa.Column("longitude", sa.Float(), nullable=True))
    op.execute("UPDATE photos AS photo SET map_id = place.map_id, storage_scope_id = photo.place_id FROM places AS place WHERE place.id = photo.place_id")
    op.alter_column("photos", "map_id", nullable=False)
    op.alter_column("photos", "storage_scope_id", nullable=False)
    op.create_foreign_key("photos_map_id_fkey", "photos", "poi_maps", ["map_id"], ["id"], ondelete="CASCADE")
    op.create_index("photos_map_id_idx", "photos", ["map_id"])
    op.create_check_constraint("photos_coordinates_pair", "photos", "(latitude IS NULL) = (longitude IS NULL)")
    op.create_check_constraint("photos_latitude_range", "photos", "latitude IS NULL OR latitude BETWEEN -90 AND 90")
    op.create_check_constraint("photos_longitude_range", "photos", "longitude IS NULL OR longitude BETWEEN -180 AND 180")


def downgrade() -> None:
    op.drop_constraint("photos_longitude_range", "photos", type_="check")
    op.drop_constraint("photos_latitude_range", "photos", type_="check")
    op.drop_constraint("photos_coordinates_pair", "photos", type_="check")
    op.drop_index("photos_map_id_idx", table_name="photos")
    op.drop_constraint("photos_map_id_fkey", "photos", type_="foreignkey")
    op.drop_column("photos", "longitude")
    op.drop_column("photos", "latitude")
    op.drop_column("photos", "storage_scope_id")
    op.drop_column("photos", "map_id")
