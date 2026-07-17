"""add trip arrivals

Revision ID: d4a8e6c2f913
Revises: c9f4a2d8e761
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d4a8e6c2f913"
down_revision = "c9f4a2d8e761"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trip_arrivals",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True)),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_arrivals_coordinates_check"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", name="trip_arrivals_trip_id_key"),
    )
    op.create_index("trip_arrivals_trip_id_idx", "trip_arrivals", ["trip_id"])


def downgrade() -> None:
    op.drop_index("trip_arrivals_trip_id_idx", table_name="trip_arrivals")
    op.drop_table("trip_arrivals")
