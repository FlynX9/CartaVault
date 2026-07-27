"""add unified trash retention

Revision ID: f2a6c8d4e915
Revises: e9c4a2b7d610
Create Date: 2026-07-27
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f2a6c8d4e915"
down_revision: str | None = "e9c4a2b7d610"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("poi_maps", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("poi_maps", sa.Column("deleted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("poi_maps", sa.Column("purge_after", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "poi_maps_deleted_by_user_id_fkey",
        "poi_maps",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("poi_maps_deleted_at_idx", "poi_maps", ["deleted_at"])
    op.create_index("poi_maps_purge_after_idx", "poi_maps", ["purge_after"])

    op.add_column("trips", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("trips", sa.Column("deleted_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("trips", sa.Column("purge_after", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "trips_deleted_by_user_id_fkey",
        "trips",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("trips_deleted_at_idx", "trips", ["deleted_at"])
    op.create_index("trips_purge_after_idx", "trips", ["purge_after"])

    op.add_column("places", sa.Column("purge_after", sa.DateTime(), nullable=True))
    op.execute("UPDATE places SET purge_after = deleted_at + INTERVAL '30 days' WHERE deleted_at IS NOT NULL")
    op.create_index("places_purge_after_idx", "places", ["purge_after"])

    op.drop_constraint("poi_maps_owner_country_key", "poi_maps", type_="unique")
    op.create_index(
        "poi_maps_owner_country_active_key",
        "poi_maps",
        ["owner_id", "country_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("poi_maps_owner_country_active_key", table_name="poi_maps")
    op.create_unique_constraint("poi_maps_owner_country_key", "poi_maps", ["owner_id", "country_id"])

    op.drop_index("places_purge_after_idx", table_name="places")
    op.drop_column("places", "purge_after")

    op.drop_index("trips_purge_after_idx", table_name="trips")
    op.drop_index("trips_deleted_at_idx", table_name="trips")
    op.drop_constraint("trips_deleted_by_user_id_fkey", "trips", type_="foreignkey")
    op.drop_column("trips", "purge_after")
    op.drop_column("trips", "deleted_by_user_id")
    op.drop_column("trips", "deleted_at")

    op.drop_index("poi_maps_purge_after_idx", table_name="poi_maps")
    op.drop_index("poi_maps_deleted_at_idx", table_name="poi_maps")
    op.drop_constraint("poi_maps_deleted_by_user_id_fkey", "poi_maps", type_="foreignkey")
    op.drop_column("poi_maps", "purge_after")
    op.drop_column("poi_maps", "deleted_by_user_id")
    op.drop_column("poi_maps", "deleted_at")
