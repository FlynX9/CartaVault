"""move routing options from users to trips

Revision ID: a1c5e8f2b740
Revises: f9a1d4b7c320
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c5e8f2b740"
down_revision = "f9a1d4b7c320"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("avoid_tolls", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("trips", sa.Column("avoid_highways", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("trips", sa.Column("avoid_ferries", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("trips", sa.Column("traffic_mode", sa.String(length=32), nullable=False, server_default=sa.text("'traffic_unaware'")))
    op.create_check_constraint("trips_traffic_mode_check", "trips", "traffic_mode IN ('traffic_unaware','traffic_aware','traffic_aware_optimal')")
    op.execute("""
        UPDATE trips AS trip
        SET avoid_tolls = COALESCE((usr.preferences->'routing'->>'avoid_tolls')::boolean, false),
            avoid_highways = COALESCE((usr.preferences->'routing'->>'avoid_highways')::boolean, false),
            avoid_ferries = COALESCE((usr.preferences->'routing'->>'avoid_ferries')::boolean, false),
            traffic_mode = CASE
                WHEN usr.preferences->'routing'->>'traffic_mode' IN ('traffic_unaware','traffic_aware','traffic_aware_optimal')
                THEN usr.preferences->'routing'->>'traffic_mode'
                ELSE 'traffic_unaware'
            END
        FROM users AS usr
        WHERE usr.id = trip.created_by_user_id
    """)
    op.execute("""
        UPDATE users
        SET preferences = jsonb_set(
            preferences,
            '{routing}',
            COALESCE(preferences->'routing', '{}'::jsonb)
                - 'stay_in_country' - 'avoid_tolls' - 'avoid_highways' - 'avoid_ferries' - 'traffic_mode'
        )
        WHERE preferences ? 'routing'
    """)


def downgrade() -> None:
    op.drop_constraint("trips_traffic_mode_check", "trips", type_="check")
    op.drop_column("trips", "traffic_mode")
    op.drop_column("trips", "avoid_ferries")
    op.drop_column("trips", "avoid_highways")
    op.drop_column("trips", "avoid_tolls")
