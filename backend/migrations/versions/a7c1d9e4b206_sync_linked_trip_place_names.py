"""synchronize linked trip place names

Revision ID: a7c1d9e4b206
Revises: f5d8a2c7e941
Create Date: 2026-07-30
"""

from collections.abc import Sequence

from alembic import op


revision: str = "a7c1d9e4b206"
down_revision: str | None = "f5d8a2c7e941"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Repair stale snapshots that are still linked to an existing place."""

    for table_name in (
        "trip_stops",
        "trip_nights",
        "trip_departures",
        "trip_arrivals",
    ):
        op.execute(
            f"""
            UPDATE {table_name} AS linked_location
            SET name = places.name
            FROM places
            WHERE linked_location.place_id = places.id
              AND linked_location.name IS DISTINCT FROM places.name
            """
        )


def downgrade() -> None:
    """The previous copied names cannot be reconstructed safely."""
