import pytest
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration

PARENT_REVISION = "c1a7d4e9b620"
TRIP_REVISION = "f8d2c4a6b910"
TRIP_TABLES = {"trips", "trip_days", "trip_stops", "trip_nights"}


def test_trip_migration_upgrade_downgrade_upgrade_cycle(migration_environment) -> None:
    """Exercise the trip schema only against the guarded test database."""

    migration_environment.upgrade(PARENT_REVISION)
    engine = migration_environment.engine

    try:
        migration_environment.upgrade(TRIP_REVISION)
        inspector = inspect(engine)
        assert TRIP_TABLES <= set(inspector.get_table_names())
        assert {"trips_map_id_idx", "trips_created_by_user_id_idx"} <= {item["name"] for item in inspector.get_indexes("trips")}
        assert "trip_stops_day_sort_order_key" in {item["name"] for item in inspector.get_unique_constraints("trip_stops")}
        assert "trip_nights_trip_days_key" in {item["name"] for item in inspector.get_unique_constraints("trip_nights")}

        migration_environment.downgrade(PARENT_REVISION)
        assert TRIP_TABLES.isdisjoint(inspect(engine).get_table_names())
    finally:
        migration_environment.upgrade("heads")

    migration_environment.assert_at_head()
    assert TRIP_TABLES <= set(inspect(engine).get_table_names())
    assert "trip_departures" in inspect(engine).get_table_names()
    assert "trip_night_photos" in inspect(engine).get_table_names()
    assert "trip_night_photos_night_order_key" in {item["name"] for item in inspect(engine).get_unique_constraints("trip_night_photos")}
    assert {"website_url", "check_in_from_time", "check_in_until_time", "check_out_from_time", "check_out_until_time"} <= {item["name"] for item in inspect(engine).get_columns("trip_nights")}
    assert "trip_departures_trip_id_key" in {item["name"] for item in inspect(engine).get_unique_constraints("trip_departures")}
