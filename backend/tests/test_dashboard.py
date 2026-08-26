from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.countries.models import Country
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.statuses.service import create_default_statuses


pytestmark = pytest.mark.integration


def _user(database_session: Session, label: str) -> User:
    user = User(
        email=f"dashboard-{label}-{uuid4()}@example.test",
        display_name=f"Dashboard {label}",
        password_hash="test-only-not-a-real-password-hash",
        is_admin=False,
        is_active=True,
    )
    database_session.add(user)
    database_session.flush()
    return user


def _set_current_user(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def test_dashboard_is_scoped_to_accessible_maps_for_every_membership_role(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    france_country: Country,
) -> None:
    auth_user.is_admin = False
    editor = _user(database_session, "editor")
    viewer = _user(database_session, "viewer")
    foreign_owner = _user(database_session, "foreign")
    database_session.add_all(
        [
            MapMembership(map_id=poi_map.id, user_id=editor.id, role="editor"),
            MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"),
        ]
    )
    foreign_map = PoiMap(
        name="Private foreign map",
        country_id=france_country.id,
        owner_id=foreign_owner.id,
        is_private=True,
    )
    database_session.add(foreign_map)
    database_session.flush()
    database_session.add(MapMembership(map_id=foreign_map.id, user_id=foreign_owner.id, role="owner"))
    create_default_statuses(database_session, foreign_map.id)
    database_session.flush()

    _set_current_user(auth_user)
    own_place = integration_client.post(
        "/places",
        json={
            "name": "Accessible dashboard place",
            "map_id": str(poi_map.id),
            "latitude": 48.8566,
            "longitude": 2.3522,
            "region": "Paris",
        },
    )
    assert own_place.status_code == 201
    own_trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Accessible trip"})
    assert own_trip.status_code == 201

    _set_current_user(foreign_owner)
    foreign_place = integration_client.post(
        "/places",
        json={
            "name": "Secret foreign place",
            "map_id": str(foreign_map.id),
            "latitude": 43.2965,
            "longitude": 5.3698,
        },
    )
    assert foreign_place.status_code == 201
    foreign_trip = integration_client.post(f"/maps/{foreign_map.id}/trips", json={"name": "Secret foreign trip"})
    assert foreign_trip.status_code == 201

    for user in (auth_user, editor, viewer):
        _set_current_user(user)
        response = integration_client.get("/dashboard")
        assert response.status_code == 200
        payload = response.json()
        assert payload["summary"]["maps"] == 1
        assert payload["summary"]["places"] == 1
        assert payload["summary"]["trips"] == 1
        assert [place["name"] for place in payload["recent_places"]] == ["Accessible dashboard place"]
        assert [trip["name"] for trip in payload["recent_trips"]] == ["Accessible trip"]
        assert all(point["count"] == 1 for point in payload["map_points"])


def test_dashboard_returns_a_complete_empty_state_for_an_account_without_maps(
    integration_client: TestClient,
    database_session: Session,
) -> None:
    empty_user = _user(database_session, "empty")
    _set_current_user(empty_user)

    response = integration_client.get("/dashboard")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {
        "places": 0,
        "maps": 0,
        "countries": 0,
        "trips": 0,
        "visited_places": 0,
        "unvisited_places": 0,
        "favorites": 0,
        "media": 0,
        "places_without_photos": 0,
        "planned_trips": 0,
        "completed_trips": 0,
    }
    assert payload["statuses"] == []
    assert payload["top_countries"] == []
    assert payload["top_categories"] == []
    assert payload["recent_places"] == []
    assert payload["recent_trips"] == []
    assert payload["map_points"] == []
    assert payload["activity"] == []


def _create_trip_with_days(
    integration_client: TestClient,
    poi_map_id,
    name: str,
    day_specs: list[dict],
    database_session: Session,
):
    """Create one trip and stamp each day with explicit route columns."""

    created = integration_client.post(f"/maps/{poi_map_id}/trips", json={"name": name})
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]
    # A fresh trip already ships its first day; add only the missing ones.
    for _ in range(max(0, len(day_specs) - 1)):
        day = integration_client.post(f"/trips/{trip_id}/days", json={})
        assert day.status_code == 201, day.text

    from app.trips.models import TripDay

    days = (
        database_session.query(TripDay)
        .filter(TripDay.trip_id == trip_id)
        .order_by(TripDay.sort_order)
        .all()
    )
    assert len(days) == len(day_specs)
    for day, spec in zip(days, day_specs):
        day.route_status = spec.get("status")
        day.route_distance_meters = spec.get("distance")
        day.route_duration_seconds = spec.get("duration")
    database_session.flush()
    return trip_id


def test_dashboard_route_metrics_only_count_current_routes(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
) -> None:
    auth_user.is_admin = False
    _set_current_user(auth_user)

    _create_trip_with_days(
        integration_client,
        poi_map.id,
        "Toutes prêtes",
        [
            {"status": "ready", "distance": 1000.0, "duration": 600.0},
            {"status": "ready", "distance": 2000.0, "duration": 1200.0},
        ],
        database_session,
    )
    _create_trip_with_days(
        integration_client,
        poi_map.id,
        "Mixte",
        [
            {"status": "ready", "distance": 10000.0, "duration": 3600.0},
            {"status": "stale", "distance": 999999.0, "duration": 99999.0},
            {"status": "failed", "distance": 888888.0, "duration": 88888.0},
            {"status": None, "distance": 777777.0, "duration": 77777.0},
            {"status": "ready", "distance": None, "duration": None},
        ],
        database_session,
    )
    _create_trip_with_days(
        integration_client,
        poi_map.id,
        "Aucune prête",
        [{"status": "stale", "distance": 555555.0, "duration": 55555.0}],
        database_session,
    )

    response = integration_client.get("/dashboard")
    assert response.status_code == 200
    payload = response.json()

    trips_by_name = {trip["name"]: trip for trip in payload["recent_trips"]}
    assert set(trips_by_name) == {"Toutes prêtes", "Mixte", "Aucune prête"}

    ready_only = trips_by_name["Toutes prêtes"]
    assert ready_only["day_count"] == 2
    assert ready_only["route_distance_meters"] == 3000.0
    assert ready_only["route_duration_seconds"] == 1800.0

    mixed = trips_by_name["Mixte"]
    # Only the single ready day feeds distance/duration; stale, failed and
    # unlabelled routes are excluded even though their old values persist.
    assert mixed["day_count"] == 5
    assert mixed["route_distance_meters"] == 10000.0
    assert mixed["route_duration_seconds"] == 3600.0

    none_ready = trips_by_name["Aucune prête"]
    assert none_ready["day_count"] == 1
    assert none_ready["route_distance_meters"] == 0
    assert none_ready["route_duration_seconds"] == 0

    # The existing stale-routes attention counter is unaffected by AUD-020.
    assert payload["attention"]["stale_routes"] == 3

    # Same policy as the canonical per-trip summary: ready-only totals.
    from app.trips.summary_service import trip_summary
    from app.trips.models import Trip

    mixed_row = database_session.query(Trip).filter(Trip.name == "Mixte").one()
    summary = trip_summary(mixed_row)
    assert summary["total_route_distance_meters"] == mixed["route_distance_meters"]
    assert summary["total_route_duration_seconds"] == mixed["route_duration_seconds"]


def test_dashboard_groups_identical_statuses_and_categories_across_accessible_maps(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    france_country: Country,
) -> None:
    auth_user.is_admin = False
    second_owner = _user(database_session, "second-owner")
    second_map = PoiMap(
        name="Second accessible map",
        country_id=france_country.id,
        owner_id=second_owner.id,
        is_private=True,
    )
    database_session.add(second_map)
    database_session.flush()
    database_session.add_all(
        [
            MapMembership(map_id=second_map.id, user_id=second_owner.id, role="owner"),
            MapMembership(map_id=second_map.id, user_id=auth_user.id, role="editor"),
        ]
    )
    create_default_statuses(database_session, second_map.id)
    database_session.flush()
    _set_current_user(auth_user)

    places = []
    for index, map_id in enumerate((poi_map.id, second_map.id), start=1):
        place_response = integration_client.post(
            "/places",
            json={
                "name": f"Grouped place {index}",
                "map_id": str(map_id),
                "latitude": 48.0 + index,
                "longitude": 2.0 + index,
            },
        )
        assert place_response.status_code == 201
        places.append(place_response.json())

        category_response = integration_client.post(
            "/categories",
            json={"name": "Église", "map_id": str(map_id), "icon": "mdi:church"},
        )
        assert category_response.status_code == 201
        assign_response = integration_client.post(
            f"/places/{places[-1]['id']}/categories/{category_response.json()['id']}",
        )
        assert assign_response.status_code == 200

    response = integration_client.get("/dashboard")

    assert response.status_code == 200
    payload = response.json()
    grouped_status = next(
        status
        for status in payload["statuses"]
        if status["name"] == places[0]["status"]["name"]
        and status["color"] == places[0]["status"]["color"]
    )
    assert grouped_status["id"] is None
    assert grouped_status["count"] == 2
    assert payload["top_categories"] == [
        {
            "id": None,
            "name": "Église",
            "count": 2,
            "icon": "mdi:church",
            "country_code": None,
        }
    ]
