import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration

PARENT_REVISION = "c1a7d4e9b620"
TRIP_REVISION = "f8d2c4a6b910"
HEAD_REVISION = "b7e1d5c9a240"
TRIP_TABLES = {"trips", "trip_days", "trip_stops", "trip_nights"}


def test_trip_migration_upgrade_downgrade_upgrade_cycle(test_engine, test_database_url, monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise the trip schema only against the guarded test database."""

    assert test_database_url.database == "poi_manager_test"
    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")

    command.downgrade(config, PARENT_REVISION)
    # The session fixture calls metadata.create_all; remove only the new domain
    # so this test exercises Alembic from the actual parent revision.
    with test_engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS trip_nights CASCADE"))
        connection.execute(text("DROP TABLE IF EXISTS trip_stops CASCADE"))
        connection.execute(text("DROP TABLE IF EXISTS trip_days CASCADE"))
        connection.execute(text("DROP TABLE IF EXISTS trips CASCADE"))

    try:
        command.upgrade(config, TRIP_REVISION)
        inspector = inspect(test_engine)
        assert TRIP_TABLES <= set(inspector.get_table_names())
        assert {"trips_map_id_idx", "trips_created_by_user_id_idx"} <= {item["name"] for item in inspector.get_indexes("trips")}
        assert "trip_stops_day_sort_order_key" in {item["name"] for item in inspector.get_unique_constraints("trip_stops")}
        assert "trip_nights_trip_days_key" in {item["name"] for item in inspector.get_unique_constraints("trip_nights")}

        command.downgrade(config, PARENT_REVISION)
        assert TRIP_TABLES.isdisjoint(inspect(test_engine).get_table_names())
    finally:
        command.upgrade(config, "head")

    with test_engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == HEAD_REVISION
    assert TRIP_TABLES <= set(inspect(test_engine).get_table_names())
    assert "trip_departures" in inspect(test_engine).get_table_names()
    assert "trip_departures_trip_id_key" in {item["name"] for item in inspect(test_engine).get_unique_constraints("trip_departures")}
