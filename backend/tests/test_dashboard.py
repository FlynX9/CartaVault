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
