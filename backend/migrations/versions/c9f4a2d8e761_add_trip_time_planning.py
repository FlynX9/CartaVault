"""add trip time planning

Revision ID: c9f4a2d8e761
Revises: b7e1d5c9a240
"""
from alembic import op
import sqlalchemy as sa

revision = "c9f4a2d8e761"
down_revision = "b7e1d5c9a240"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trip_days", sa.Column("target_arrival_time", sa.Time()))
    op.add_column("trip_days", sa.Column("default_stop_buffer_minutes", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.add_column("trip_days", sa.Column("safety_margin_type", sa.String(16), server_default=sa.text("'fixed'"), nullable=False))
    op.add_column("trip_days", sa.Column("safety_margin_value", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.create_check_constraint("trip_days_buffer_check", "trip_days", "default_stop_buffer_minutes BETWEEN 0 AND 720")
    op.create_check_constraint("trip_days_margin_type_check", "trip_days", "safety_margin_type IN ('fixed','percentage')")
    op.create_check_constraint("trip_days_margin_value_check", "trip_days", "(safety_margin_type = 'fixed' AND safety_margin_value BETWEEN 0 AND 720) OR (safety_margin_type = 'percentage' AND safety_margin_value BETWEEN 0 AND 100)")

    op.add_column("trips", sa.Column("low_load_max_minutes", sa.Integer(), server_default=sa.text("240"), nullable=False))
    op.add_column("trips", sa.Column("medium_load_max_minutes", sa.Integer(), server_default=sa.text("480"), nullable=False))
    op.add_column("trips", sa.Column("low_load_color", sa.String(7), server_default=sa.text("'#0FA68A'"), nullable=False))
    op.add_column("trips", sa.Column("medium_load_color", sa.String(7), server_default=sa.text("'#D97706'"), nullable=False))
    op.add_column("trips", sa.Column("high_load_color", sa.String(7), server_default=sa.text("'#DC2626'"), nullable=False))
    op.create_check_constraint("trips_load_thresholds_check", "trips", "low_load_max_minutes > 0 AND medium_load_max_minutes > low_load_max_minutes")
    op.create_check_constraint("trips_load_colors_check", "trips", "low_load_color ~ '^#[0-9A-Fa-f]{6}$' AND medium_load_color ~ '^#[0-9A-Fa-f]{6}$' AND high_load_color ~ '^#[0-9A-Fa-f]{6}$'")


def downgrade() -> None:
    op.drop_constraint("trips_load_colors_check", "trips", type_="check")
    op.drop_constraint("trips_load_thresholds_check", "trips", type_="check")
    for column in ("high_load_color", "medium_load_color", "low_load_color", "medium_load_max_minutes", "low_load_max_minutes"):
        op.drop_column("trips", column)
    op.drop_constraint("trip_days_margin_value_check", "trip_days", type_="check")
    op.drop_constraint("trip_days_margin_type_check", "trip_days", type_="check")
    op.drop_constraint("trip_days_buffer_check", "trip_days", type_="check")
    for column in ("safety_margin_value", "safety_margin_type", "default_stop_buffer_minutes", "target_arrival_time"):
        op.drop_column("trip_days", column)
