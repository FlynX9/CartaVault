from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration
PARENT_REVISION = "a8c4f2d9e715"
ROUTING_PROVIDER_REVISION = "b2e7c4a9d531"


def test_routing_provider_upgrade_downgrade_upgrade_cycle(test_engine, test_database_url, monkeypatch: pytest.MonkeyPatch) -> None:
    assert test_database_url.database == "cartavault_test"
    monkeypatch.setenv("DATABASE_URL", test_database_url.render_as_string(hide_password=False))
    config = Config("alembic.ini")
    user_id, map_id, membership_id, trip_id, day_id = (uuid4() for _ in range(5))
    command.downgrade(config, PARENT_REVISION)
    assert "route_provider" not in {item["name"] for item in inspect(test_engine).get_columns("trip_days")}
    with test_engine.begin() as connection:
        country_id = connection.scalar(text("SELECT id FROM countries ORDER BY iso_alpha3 LIMIT 1"))
        connection.execute(text("INSERT INTO users (id, email, display_name, password_hash, is_admin, is_active) VALUES (:id, :email, 'Routing migration', 'x', false, true)"), {"id": user_id, "email": f"routing-{user_id}@example.test"})
        connection.execute(text("INSERT INTO poi_maps (id, name, country_id, owner_id, is_private) VALUES (:id, 'Routing migration map', :country_id, :owner_id, true)"), {"id": map_id, "country_id": country_id, "owner_id": user_id})
        connection.execute(text("INSERT INTO map_memberships (id, map_id, user_id, role) VALUES (:id, :map_id, :user_id, 'owner')"), {"id": membership_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trips (id, map_id, created_by_user_id, name) VALUES (:id, :map_id, :user_id, 'Existing route')"), {"id": trip_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trip_days (id, trip_id, day_number, sort_order, route_geometry) VALUES (:id, :trip_id, 1, 0, CAST(:geometry AS jsonb))"), {"id": day_id, "trip_id": trip_id, "geometry": '{"type":"LineString","coordinates":[[2,48],[3,49]]}'})
    try:
        command.upgrade(config, ROUTING_PROVIDER_REVISION)
        assert "route_provider" in {item["name"] for item in inspect(test_engine).get_columns("trip_days")}
        with test_engine.connect() as connection:
            assert connection.scalar(text("SELECT route_provider FROM trip_days WHERE id = :id"), {"id": day_id}) == "osrm"
        command.downgrade(config, PARENT_REVISION)
        assert "route_provider" not in {item["name"] for item in inspect(test_engine).get_columns("trip_days")}
    finally:
        command.upgrade(config, "head")
        with test_engine.begin() as connection:
            connection.execute(text("DELETE FROM poi_maps WHERE id = :id"), {"id": map_id})
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    with test_engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == ScriptDirectory.from_config(config).get_current_head()
