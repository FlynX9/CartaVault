"""add trip departures

Revision ID: b7e1d5c9a240
Revises: f8d2c4a6b910
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b7e1d5c9a240"
down_revision = "f8d2c4a6b910"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trip_departures",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("notes", sa.Text()),
        sa.Column("departure_time", sa.Time()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_departures_coordinates_check"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", name="trip_departures_trip_id_key"),
    )
    op.create_index("trip_departures_trip_id_idx", "trip_departures", ["trip_id"])


def downgrade() -> None:
    op.drop_index("trip_departures_trip_id_idx", table_name="trip_departures")
    op.drop_table("trip_departures")
