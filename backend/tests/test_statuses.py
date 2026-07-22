from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.countries.models import Country
from app.main import app
from app.maps.models import MapMembership
from app.statuses.models import PlaceStatus


pytestmark = pytest.mark.integration


def test_status_crud_default_and_conflicts(integration_client, database_session, poi_map) -> None:
    map_id = str(poi_map.id)
    initial = integration_client.get("/statuses", params={"map_id": map_id})
    assert initial.status_code == 200
    assert [(item["name"], item["functional_state"]) for item in initial.json()] == [
        ("À faire", "non_visited"),
        ("À vérifier", "non_visited"),
        ("Visité", "visited"),
        ("À refaire", "visited"),
    ]
    assert all(item["map_id"] == map_id for item in initial.json())
    assert next(item for item in initial.json() if item["name"] == "À faire")["is_default"] is True

    created = integration_client.post(
        "/statuses",
        json={"map_id": map_id, "name": "  À inspecter  ", "color": "#123ABC", "sort_order": 15, "functional_state": "non_visited"},
    )
    assert created.status_code == 201
    status_id = created.json()["id"]
    assert created.json()["slug"] == "a-inspecter"

    assert integration_client.get("/statuses", params={"map_id": map_id, "q": "inspect"}).json()[0]["id"] == status_id
    assert integration_client.post(
        "/statuses", json={"map_id": map_id, "name": "À inspecter", "color": "#123ABC", "functional_state": "visited"}
    ).status_code == 409
    assert integration_client.post(
        "/statuses", json={"map_id": map_id, "name": "Bad", "color": "blue", "functional_state": "unknown"}
    ).status_code == 422

    made_default = integration_client.patch(
        f"/statuses/{status_id}", json={"is_default": True, "color": "#ABC123"}
    )
    assert made_default.status_code == 200
    defaults = database_session.scalars(
        select(PlaceStatus).where(PlaceStatus.map_id == poi_map.id, PlaceStatus.is_default.is_(True))
    ).all()
    assert [str(item.id) for item in defaults] == [created.json()["id"]]
    assert integration_client.patch(
        f"/statuses/{status_id}", json={"is_active": False}
    ).status_code == 409
    assert integration_client.delete(f"/statuses/{status_id}").status_code == 409

    original_default = next(item for item in initial.json() if item["name"] == "À faire")
    assert integration_client.patch(
        f"/statuses/{original_default['id']}", json={"is_default": True}
    ).status_code == 200
    assert integration_client.patch(
        f"/statuses/{status_id}", json={"is_active": False}
    ).status_code == 200
    assert all(item["id"] != status_id for item in integration_client.get(
        "/statuses", params={"map_id": map_id, "active_only": True}
    ).json())
    assert integration_client.delete(f"/statuses/{status_id}").status_code == 204
    assert integration_client.get(f"/statuses/{uuid4()}").status_code == 404


def test_places_use_and_filter_tracking_status(integration_client, poi_map) -> None:
    explicit = integration_client.post(
        "/statuses",
        json={"map_id": str(poi_map.id), "name": "Photographié", "color": "#16A34A", "functional_state": "visited"},
    ).json()
    default_place = integration_client.post(
        "/places",
        json={"name": "Default", "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1},
    )
    explicit_place = integration_client.post(
        "/places",
        json={"name": "Explicit", "map_id": str(poi_map.id), "status_id": explicit["id"], "latitude": 48.2, "longitude": 2.2},
    )
    assert default_place.status_code == explicit_place.status_code == 201
    assert default_place.json()["status"]["is_active"] is True
    assert explicit_place.json()["status"]["id"] == explicit["id"]

    filtered = integration_client.get(
        "/places/map",
        params={"map_id": str(poi_map.id), "status_id": explicit["id"], "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3},
    )
    assert filtered.status_code == 200
    assert [item["name"] for item in filtered.json()] == ["Explicit"]
    assert filtered.json()[0]["status"]["color"] == "#16A34A"
    assert filtered.json()[0]["status"]["functional_state"] == "visited"
    assert filtered.json()[0]["is_visited"] is True
    assert "is_active" not in filtered.json()[0]["status"]
    assert integration_client.get(
        "/places/map",
        params={"map_id": str(poi_map.id), "status_id": str(uuid4()), "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3},
    ).json() == []
    assert integration_client.delete(f"/statuses/{explicit['id']}").status_code == 409
    assert integration_client.delete(f"/places/{explicit_place.json()['id']}").status_code == 204
    assert integration_client.delete(f"/places/{explicit_place.json()['id']}/permanent").status_code == 204
    assert integration_client.delete(f"/statuses/{explicit['id']}").status_code == 204


def test_status_functional_state_change_immediately_reclassifies_places(integration_client, poi_map) -> None:
    statuses = integration_client.get("/statuses", params={"map_id": str(poi_map.id)}).json()
    target = next(item for item in statuses if item["name"] == "À vérifier")
    place = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "status_id": target["id"], "name": "À reclasser", "latitude": 48.4, "longitude": 2.4},
    ).json()

    assert place["is_visited"] is False
    changed = integration_client.patch(f"/statuses/{target['id']}", json={"functional_state": "visited"})
    assert changed.status_code == 200
    assert changed.json()["places_count"] == 1
    assert integration_client.get(f"/places/{place['id']}").json()["is_visited"] is True
    assert [item["id"] for item in integration_client.get(
        "/places",
        params={"map_id": str(poi_map.id), "functional_state": "visited"},
    ).json()] == [place["id"]]


def test_new_map_receives_four_customizable_functional_statuses(
    integration_client,
    database_session,
    france_country,
) -> None:
    country = database_session.scalar(
        select(Country).where(Country.id != france_country.id).order_by(Country.iso_alpha3)
    )
    response = integration_client.post(
        "/maps",
        json={"country_id": str(country.id), "name": "Default statuses"},
    )
    assert response.status_code == 201
    map_id = response.json()["id"]

    statuses = integration_client.get("/statuses", params={"map_id": map_id}).json()
    assert [(item["name"], item["functional_state"], item["color"]) for item in statuses] == [
        ("À faire", "non_visited", "#2563EB"),
        ("À vérifier", "non_visited", "#D97706"),
        ("Visité", "visited", "#16A34A"),
        ("À refaire", "visited", "#7C3AED"),
    ]


def test_status_permissions_and_map_isolation(
    integration_client,
    database_session,
    auth_user,
    poi_map,
    france_country,
) -> None:
    viewer = User(email=f"viewer-{uuid4()}@example.test", display_name="Viewer", password_hash="x", is_active=True)
    editor = User(email=f"editor-{uuid4()}@example.test", display_name="Editor", password_hash="x", is_active=True)
    outsider = User(email=f"outsider-{uuid4()}@example.test", display_name="Outsider", password_hash="x", is_active=True)
    database_session.add_all([viewer, editor, outsider])
    database_session.flush()
    database_session.add_all([
        MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"),
        MapMembership(map_id=poi_map.id, user_id=editor.id, role="editor"),
    ])
    database_session.flush()
    status_id = str(database_session.scalar(
        select(PlaceStatus.id).where(PlaceStatus.map_id == poi_map.id).order_by(PlaceStatus.sort_order)
    ))
    other_country = database_session.scalar(
        select(Country).where(Country.id != france_country.id).order_by(Country.iso_alpha3)
    )
    other_map = integration_client.post(
        "/maps", json={"country_id": str(other_country.id), "name": "Other map"}
    ).json()
    other_status_id = integration_client.get(
        "/statuses", params={"map_id": other_map["id"]}
    ).json()[0]["id"]
    assert integration_client.get(
        "/places",
        params={"map_id": str(poi_map.id), "status_ids": other_status_id},
    ).json() == []

    try:
        app.dependency_overrides[get_current_user] = lambda: viewer
        assert integration_client.get("/statuses", params={"map_id": str(poi_map.id)}).status_code == 200
        assert integration_client.post(
            "/statuses",
            json={"map_id": str(poi_map.id), "name": "Viewer status", "color": "#123456", "functional_state": "non_visited"},
        ).status_code == 403
        assert integration_client.patch(f"/statuses/{status_id}", json={"color": "#123456"}).status_code == 403

        app.dependency_overrides[get_current_user] = lambda: editor
        created = integration_client.post(
            "/statuses",
            json={"map_id": str(poi_map.id), "name": "Editor status", "color": "#123456", "functional_state": "visited"},
        )
        assert created.status_code == 201

        app.dependency_overrides[get_current_user] = lambda: outsider
        assert integration_client.get("/statuses", params={"map_id": str(poi_map.id)}).status_code == 404
        assert integration_client.get(f"/statuses/{status_id}").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user
