from uuid import uuid4

import pytest
from sqlalchemy import inspect, text


pytestmark = pytest.mark.integration
PARENT_REVISION = "a8c4f2d9e715"
ROUTING_PROVIDER_REVISION = "b2e7c4a9d531"


def test_routing_provider_upgrade_downgrade_upgrade_cycle(migration_environment) -> None:
    migration_environment.upgrade(PARENT_REVISION)
    engine = migration_environment.engine
    user_id, map_id, membership_id, trip_id, day_id = (uuid4() for _ in range(5))
    assert "route_provider" not in {item["name"] for item in inspect(engine).get_columns("trip_days")}
    with engine.begin() as connection:
        country_id = connection.scalar(text("SELECT id FROM countries ORDER BY iso_alpha3 LIMIT 1"))
        connection.execute(text("INSERT INTO users (id, email, display_name, password_hash, is_admin, is_active) VALUES (:id, :email, 'Routing migration', 'x', false, true)"), {"id": user_id, "email": f"routing-{user_id}@example.test"})
        connection.execute(text("INSERT INTO poi_maps (id, name, country_id, owner_id, is_private) VALUES (:id, 'Routing migration map', :country_id, :owner_id, true)"), {"id": map_id, "country_id": country_id, "owner_id": user_id})
        connection.execute(text("INSERT INTO map_memberships (id, map_id, user_id, role) VALUES (:id, :map_id, :user_id, 'owner')"), {"id": membership_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trips (id, map_id, created_by_user_id, name) VALUES (:id, :map_id, :user_id, 'Existing route')"), {"id": trip_id, "map_id": map_id, "user_id": user_id})
        connection.execute(text("INSERT INTO trip_days (id, trip_id, day_number, sort_order, route_geometry) VALUES (:id, :trip_id, 1, 0, CAST(:geometry AS jsonb))"), {"id": day_id, "trip_id": trip_id, "geometry": '{"type":"LineString","coordinates":[[2,48],[3,49]]}'})
    try:
        migration_environment.upgrade(ROUTING_PROVIDER_REVISION)
        assert "route_provider" in {item["name"] for item in inspect(engine).get_columns("trip_days")}
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT route_provider FROM trip_days WHERE id = :id"), {"id": day_id}) == "osrm"
        migration_environment.downgrade(PARENT_REVISION)
        assert "route_provider" not in {item["name"] for item in inspect(engine).get_columns("trip_days")}
    finally:
        migration_environment.upgrade("heads")
    migration_environment.assert_at_head()
