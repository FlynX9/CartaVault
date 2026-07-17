from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.countries.models import Country
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.trips.models import Trip, TripDay, TripDeparture, TripNight, TripStop
from app.trips.router import get_routing_provider
from app.trips.routing.base import MatrixResult, RouteResult, RoutingProvider

pytestmark = pytest.mark.integration


class StubRoutingProvider(RoutingProvider):
    def calculate_route(self, coordinates, profile="driving"):
        return RouteResult({"type": "LineString", "coordinates": [list(item) for item in coordinates]}, 1500, 420, [{"distance_meters": 750, "duration_seconds": 210} for _ in coordinates[1:]])

    def calculate_matrix(self, coordinates, profile="driving"):
        size = len(coordinates); values = [[0 if source == target else abs(source - target) * 10 for target in range(size)] for source in range(size)]
        return MatrixResult(values, values)


def test_trip_days_stops_nights_reorder_summary_and_permissions(integration_client, database_session, poi_map, auth_user, france_country) -> None:
    created = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Road trip", "start_date": "2026-08-01", "end_date": "2026-08-03"})
    assert created.status_code == 201
    trip_id = created.json()["id"]
    days = [integration_client.post(f"/trips/{trip_id}/days", json={"title": f"Étape {index}"}).json() for index in range(1, 4)]
    assert [item["day_number"] for item in days] == [1, 2, 3]
    assert integration_client.patch(f"/trips/{trip_id}", json={"end_date": "2026-07-31"}).status_code == 422
    assert integration_client.patch(f"/trips/{trip_id}", json={"name": None}).status_code == 422

    place = integration_client.post("/places", json={"name": "POI voyage", "map_id": str(poi_map.id), "latitude": 48.2, "longitude": 6.4}).json()
    first = integration_client.post(f"/trip-days/{days[0]['id']}/stops", json={"place_id": place["id"]})
    free = integration_client.post(f"/trip-days/{days[0]['id']}/stops", json={"stop_type": "restaurant", "name": "Restaurant libre", "latitude": 48.3, "longitude": 6.5, "visit_duration_minutes": 60})
    assert first.status_code == free.status_code == 201
    assert first.json()["name"] == "POI voyage"

    night = integration_client.post(f"/trips/{trip_id}/nights", json={"previous_day_id": days[0]["id"], "next_day_id": days[1]["id"], "name": "Hôtel", "latitude": 48.4, "longitude": 6.6})
    assert night.status_code == 201
    invalid_night = integration_client.post(f"/trips/{trip_id}/nights", json={"previous_day_id": days[0]["id"], "next_day_id": days[2]["id"], "name": "Invalide", "latitude": 48, "longitude": 6})
    assert invalid_night.status_code == 422
    assert integration_client.post(f"/trips/{trip_id}/days/reorder", json={"ids": [days[1]["id"], days[0]["id"], days[2]["id"]]}).status_code == 422

    reordered = integration_client.post(f"/trip-days/{days[0]['id']}/stops/reorder", json={"ids": [free.json()["id"], first.json()["id"]]})
    assert reordered.status_code == 200 and reordered.json()["route_status"] is None
    moved = integration_client.post(f"/trip-stops/{first.json()['id']}/move", json={"target_day_id": days[1]["id"], "sort_order": 0})
    assert moved.status_code == 200
    assert moved.json()["days"][1]["stops"][0]["id"] == first.json()["id"]

    summary = integration_client.get(f"/trips/{trip_id}/summary")
    assert summary.status_code == 200 and summary.json()["days"] == 3 and summary.json()["nights"] == 1 and summary.json()["stops"] == 2

    viewer = User(email=f"viewer-{uuid4()}@example.test", display_name="Viewer", password_hash="x", is_active=True, is_admin=False)
    database_session.add(viewer); database_session.flush(); database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer")); database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: viewer
    try:
        assert integration_client.get(f"/trips/{trip_id}").status_code == 200
        assert integration_client.patch(f"/trips/{trip_id}", json={"name": "Interdit"}).status_code == 403
        assert integration_client.post(f"/trips/{trip_id}/exports/google-maps", json={}).status_code == 200
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user


def test_removing_a_middle_stop_compacts_the_day_order(integration_client, poi_map) -> None:
    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": "Suppression d’étape"},
    ).json()
    day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    stops = [
        integration_client.post(
            f"/trip-days/{day['id']}/stops",
            json={
                "stop_type": "free_location",
                "name": f"Étape {index}",
                "latitude": 48 + index / 100,
                "longitude": 2 + index / 100,
            },
        ).json()
        for index in range(5)
    ]

    removed = integration_client.delete(f"/trip-stops/{stops[2]['id']}")
    assert removed.status_code == 204

    reloaded = integration_client.get(f"/trips/{trip['id']}")
    assert reloaded.status_code == 200
    remaining = reloaded.json()["days"][0]["stops"]
    assert [item["id"] for item in remaining] == [
        stops[0]["id"],
        stops[1]["id"],
        stops[3]["id"],
        stops[4]["id"],
    ]
    assert [item["sort_order"] for item in remaining] == [0, 1, 2, 3]


def test_trip_rejects_place_from_another_map(integration_client, database_session, poi_map, auth_user, france_country) -> None:
    other_country = database_session.scalar(select(Country).where(Country.id != france_country.id).order_by(Country.iso_alpha2))
    assert other_country is not None
    other = PoiMap(name=f"Other {uuid4()}", country_id=other_country.id, owner_id=auth_user.id, is_private=True)
    database_session.add(other); database_session.flush(); database_session.add(MapMembership(map_id=other.id, user_id=auth_user.id, role="owner")); database_session.flush()
    place = integration_client.post("/places", json={"name": "Other", "map_id": str(other.id), "latitude": 47, "longitude": 5}).json()
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Protected"}).json()
    day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    assert integration_client.post(f"/trip-days/{day['id']}/stops", json={"place_id": place["id"]}).status_code == 422
    assert database_session.scalar(select(TripStop).where(TripStop.trip_day_id == day["id"])) is None


def test_confirming_optimization_reorders_and_recalculates_route(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Optimisation"}).json()
    day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    stops = [integration_client.post(f"/trip-days/{day['id']}/stops", json={"stop_type": "free_location", "name": f"Étape {index}", "latitude": 48 + index / 10, "longitude": 2 + index / 10}).json() for index in range(3)]
    app.dependency_overrides[get_routing_provider] = lambda: StubRoutingProvider()
    try:
        response = integration_client.post(f"/trip-days/{day['id']}/optimize/confirm", json={"stop_ids": [stops[2]["id"], stops[1]["id"], stops[0]["id"]]})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["stops"]] == [stops[2]["id"], stops[1]["id"], stops[0]["id"]]
    assert response.json()["route_status"] == "ready"
    assert response.json()["route_geometry"]["type"] == "LineString"


def test_day_routes_and_optimization_keep_departure_and_night_as_fixed_anchors(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Voyage ancré"}).json()
    first = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    second = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    departure = integration_client.post(
        f"/trips/{trip['id']}/departure",
        json={"name": "Maison", "latitude": 48.0, "longitude": 2.0},
    )
    assert departure.status_code == 201
    night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={"previous_day_id": first["id"], "next_day_id": second["id"], "name": "Hôtel", "latitude": 49.0, "longitude": 3.0},
    )
    assert night.status_code == 201
    stops = [
        integration_client.post(
            f"/trip-days/{first['id']}/stops",
            json={"stop_type": "free_location", "name": f"Étape {index}", "latitude": 48.2 + index / 10, "longitude": 2.2 + index / 10},
        ).json()
        for index in range(2)
    ]
    app.dependency_overrides[get_routing_provider] = lambda: StubRoutingProvider()
    try:
        route = integration_client.post(f"/trip-days/{first['id']}/route", json={})
        optimized = integration_client.post(f"/trip-days/{first['id']}/optimize", json={})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert route.status_code == 200
    coordinates = route.json()["route_geometry"]["coordinates"]
    assert coordinates[0] == [2.0, 48.0]
    assert coordinates[-1] == [3.0, 49.0]
    assert coordinates[1][0] == pytest.approx(2.2)
    assert coordinates[2][0] == pytest.approx(2.3)
    assert route.json()["route_segments"][0]["from"].startswith("departure:")
    assert route.json()["route_segments"][-1]["to"].startswith("night:")
    assert optimized.status_code == 200
    assert optimized.json()["before"] == 30
    assert set(optimized.json()["optimized_stop_ids"]) == {item["id"] for item in stops}
    updated_departure = integration_client.patch(
        f"/trip-departures/{departure.json()['id']}",
        json={"name": "Nouveau départ", "latitude": 47.5, "longitude": 1.5},
    )
    assert updated_departure.status_code == 200
    assert updated_departure.json()["name"] == "Nouveau départ"
    assert integration_client.delete(f"/trip-departures/{departure.json()['id']}").status_code == 204
