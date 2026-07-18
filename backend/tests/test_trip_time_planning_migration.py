from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration

PARENT_REVISION = "b7e1d5c9a240"
TIME_PLANNING_REVISION = "c9f4a2d8e761"

DAY_COLUMNS = {"target_arrival_time", "default_stop_buffer_minutes", "safety_margin_type", "safety_margin_value"}
TRIP_COLUMNS = {"low_load_max_minutes", "medium_load_max_minutes", "low_load_color", "medium_load_color", "high_load_color"}


def test_trip_time_planning_upgrade_downgrade_upgrade_cycle(test_engine, test_database_url, monkeypatch: pytest.MonkeyPatch) -> None:
    """Validate the temporal planning migration only on the guarded test database."""

    assert test_database_url.database == "poi_manager_test"
    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")
    user_id, map_id, membership_id, trip_id, day_id = (uuid4() for _ in range(5))

    command.downgrade(config, PARENT_REVISION)
    inspector = inspect(test_engine)
    assert DAY_COLUMNS.isdisjoint({item["name"] for item in inspector.get_columns("trip_days")})
    assert TRIP_COLUMNS.isdisjoint({item["name"] for item in inspector.get_columns("trips")})
    with test_engine.begin() as connection:
        country_id = connection.scalar(text("SELECT id FROM countries ORDER BY iso_alpha3 LIMIT 1"))
        connection.execute(text("INSERT INTO users (id, email, display_name, password_hash, is_admin, is_active) VALUES (:id, :email, 'Migration test', 'x', false, true)"), {"id": user_id, "email": f"trip-time-{user_id}@example.test"})
        connection.execute(text("INSERT INTO poi_maps (id, name, country_id, owner_id, is_private) VALUES (:id, 'Migration time map', :country_id, :owner_id, true)"), {"id": map_id, "country_id": country_id, "owner_id": user_id})
        connection.execute(text("INSERT INTO map_memberships (id, map_id, user_id, role) VALUES (:id, :map_id, :user_id, 'owner')"), {"id": membership_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trips (id, map_id, created_by_user_id, name) VALUES (:id, :map_id, :user_id, 'Existing trip')"), {"id": trip_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trip_days (id, trip_id, day_number, sort_order, title) VALUES (:id, :trip_id, 1, 0, 'Existing day')"), {"id": day_id, "trip_id": trip_id})

    try:
        command.upgrade(config, TIME_PLANNING_REVISION)
        inspector = inspect(test_engine)
        assert DAY_COLUMNS <= {item["name"] for item in inspector.get_columns("trip_days")}
        assert TRIP_COLUMNS <= {item["name"] for item in inspector.get_columns("trips")}
        day_checks = {item["name"] for item in inspector.get_check_constraints("trip_days")}
        trip_checks = {item["name"] for item in inspector.get_check_constraints("trips")}
        assert {"trip_days_buffer_check", "trip_days_margin_type_check", "trip_days_margin_value_check"} <= day_checks
        assert {"trips_load_thresholds_check", "trips_load_colors_check"} <= trip_checks
        with test_engine.connect() as connection:
            assert connection.execute(text("SELECT default_stop_buffer_minutes, safety_margin_type, safety_margin_value FROM trip_days WHERE id = :id"), {"id": day_id}).one() == (0, "fixed", 0)
            assert connection.execute(text("SELECT low_load_max_minutes, medium_load_max_minutes, low_load_color, medium_load_color, high_load_color FROM trips WHERE id = :id"), {"id": trip_id}).one() == (240, 480, "#0FA68A", "#D97706", "#DC2626")

        command.downgrade(config, PARENT_REVISION)
        inspector = inspect(test_engine)
        assert DAY_COLUMNS.isdisjoint({item["name"] for item in inspector.get_columns("trip_days")})
        assert TRIP_COLUMNS.isdisjoint({item["name"] for item in inspector.get_columns("trips")})
        with test_engine.connect() as connection:
            assert connection.scalar(text("SELECT title FROM trip_days WHERE id = :id"), {"id": day_id}) == "Existing day"
    finally:
        command.upgrade(config, "head")
        with test_engine.begin() as connection:
            connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": map_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})

    with test_engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == ScriptDirectory.from_config(config).get_current_head()
    inspector = inspect(test_engine)
    assert DAY_COLUMNS <= {item["name"] for item in inspector.get_columns("trip_days")}
    assert TRIP_COLUMNS <= {item["name"] for item in inspector.get_columns("trips")}
