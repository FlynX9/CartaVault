"""add trip planning domain

Revision ID: f8d2c4a6b910
Revises: c1a7d4e9b620
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f8d2c4a6b910"
down_revision = "c1a7d4e9b620"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("map_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date()), sa.Column("end_date", sa.Date()),
        sa.Column("status", sa.String(24), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("routing_profile", sa.String(32), server_default=sa.text("'driving'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime()), sa.Column("archived_at", sa.DateTime()),
        sa.CheckConstraint("status IN ('draft','planned','in_progress','completed','archived')", name="trips_status_check"),
        sa.CheckConstraint("end_date IS NULL OR start_date IS NULL OR end_date >= start_date", name="trips_dates_check"),
        sa.ForeignKeyConstraint(["map_id"], ["poi_maps.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"), sa.PrimaryKeyConstraint("id"))
    op.create_index("trips_map_id_idx", "trips", ["map_id"]); op.create_index("trips_created_by_user_id_idx", "trips", ["created_by_user_id"])
    op.create_table("trip_days",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_number", sa.Integer(), nullable=False), sa.Column("date", sa.Date()), sa.Column("title", sa.String(160)), sa.Column("notes", sa.Text()),
        sa.Column("planned_start_time", sa.Time()), sa.Column("planned_end_time", sa.Time()), sa.Column("max_total_duration_minutes", sa.Integer()),
        sa.Column("route_distance_meters", sa.Float()), sa.Column("route_duration_seconds", sa.Float()), sa.Column("visit_duration_minutes", sa.Integer()), sa.Column("total_duration_minutes", sa.Integer()),
        sa.Column("route_geometry", postgresql.JSONB()), sa.Column("route_segments", postgresql.JSONB()), sa.Column("route_status", sa.String(24)), sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("day_number > 0 AND sort_order >= 0", name="trip_days_order_check"), sa.CheckConstraint("max_total_duration_minutes IS NULL OR max_total_duration_minutes > 0", name="trip_days_max_duration_check"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", "day_number", name="trip_days_trip_day_number_key"), sa.UniqueConstraint("trip_id", "sort_order", name="trip_days_trip_sort_order_key"))
    op.create_index("trip_days_trip_id_idx", "trip_days", ["trip_id"])
    op.create_table("trip_stops",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("trip_day_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("place_id", postgresql.UUID(as_uuid=True)),
        sa.Column("stop_type", sa.String(24), nullable=False), sa.Column("name", sa.String(255), nullable=False), sa.Column("latitude", sa.Float(), nullable=False), sa.Column("longitude", sa.Float(), nullable=False), sa.Column("address", sa.String(500)), sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("visit_duration_minutes", sa.Integer()), sa.Column("planned_arrival", sa.Time()), sa.Column("planned_departure", sa.Time()), sa.Column("notes", sa.Text()),
        sa.Column("is_required", sa.Boolean(), server_default=sa.text("true"), nullable=False), sa.Column("is_locked", sa.Boolean(), server_default=sa.text("false"), nullable=False), sa.Column("visit_status", sa.String(24), server_default=sa.text("'planned'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("stop_type IN ('place','free_location','hotel','restaurant','parking','station','airport','other')", name="trip_stops_type_check"), sa.CheckConstraint("visit_status IN ('planned','visited','skipped','inaccessible','postponed')", name="trip_stops_visit_status_check"),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_stops_coordinates_check"), sa.CheckConstraint("sort_order >= 0 AND (visit_duration_minutes IS NULL OR visit_duration_minutes >= 0)", name="trip_stops_order_duration_check"),
        sa.ForeignKeyConstraint(["trip_day_id"], ["trip_days.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("trip_day_id", "sort_order", name="trip_stops_day_sort_order_key"))
    op.create_index("trip_stops_day_id_idx", "trip_stops", ["trip_day_id"]); op.create_index("trip_stops_place_id_idx", "trip_stops", ["place_id"])
    op.create_table("trip_nights",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("previous_day_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("next_day_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("place_id", postgresql.UUID(as_uuid=True)),
        sa.Column("name", sa.String(255), nullable=False), sa.Column("latitude", sa.Float(), nullable=False), sa.Column("longitude", sa.Float(), nullable=False), sa.Column("address", sa.String(500)), sa.Column("notes", sa.Text()), sa.Column("check_in_time", sa.Time()), sa.Column("check_out_time", sa.Time()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("previous_day_id <> next_day_id", name="trip_nights_distinct_days_check"), sa.CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_nights_coordinates_check"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["previous_day_id"], ["trip_days.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["next_day_id"], ["trip_days.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("trip_id", "previous_day_id", "next_day_id", name="trip_nights_trip_days_key"), sa.UniqueConstraint("previous_day_id", name="trip_nights_previous_day_key"), sa.UniqueConstraint("next_day_id", name="trip_nights_next_day_key"))
    op.create_index("trip_nights_trip_id_idx", "trip_nights", ["trip_id"])


def downgrade() -> None:
    op.drop_index("trip_nights_trip_id_idx", table_name="trip_nights"); op.drop_table("trip_nights")
    op.drop_index("trip_stops_place_id_idx", table_name="trip_stops"); op.drop_index("trip_stops_day_id_idx", table_name="trip_stops"); op.drop_table("trip_stops")
    op.drop_index("trip_days_trip_id_idx", table_name="trip_days"); op.drop_table("trip_days")
    op.drop_index("trips_created_by_user_id_idx", table_name="trips"); op.drop_index("trips_map_id_idx", table_name="trips"); op.drop_table("trips")
