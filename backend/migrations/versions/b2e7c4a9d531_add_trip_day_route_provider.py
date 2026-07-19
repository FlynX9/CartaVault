"""persist the routing provider used for trip day routes

Revision ID: b2e7c4a9d531
Revises: a8c4f2d9e715
"""

from alembic import op
import sqlalchemy as sa


revision = "b2e7c4a9d531"
down_revision = "a8c4f2d9e715"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trip_days", sa.Column("route_provider", sa.String(length=16), nullable=True))
    # Every route produced before provider selection existed used OSRM.
    op.execute("UPDATE trip_days SET route_provider = 'osrm' WHERE route_geometry IS NOT NULL")
    op.create_check_constraint(
        "trip_days_route_provider_check",
        "trip_days",
        "route_provider IS NULL OR route_provider IN ('osrm','google')",
    )


def downgrade() -> None:
    op.drop_constraint("trip_days_route_provider_check", "trip_days", type_="check")
    op.drop_column("trip_days", "route_provider")
