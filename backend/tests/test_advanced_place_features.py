from __future__ import annotations

import pytest

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership


pytestmark = pytest.mark.integration


def test_favorite_ratings_visited_filters_links_and_history(integration_client, poi_map) -> None:
    statuses = integration_client.get("/statuses", params={"map_id": str(poi_map.id)}).json()
    visited_status = next(item for item in statuses if item["functional_state"] == "visited")
    non_visited_status = next(item for item in statuses if item["functional_state"] == "non_visited")

    place_response = integration_client.post(
        "/places",
        json={
            "map_id": str(poi_map.id),
            "name": "Favori visité",
            "status_id": visited_status["id"],
            "latitude": 48.1,
            "longitude": 2.1,
            "is_favorite": True,
            "interest_rating": 4.5,
            "visit_rating": 3.5,
        },
    )
    assert place_response.status_code == 201
    place_id = place_response.json()["id"]
    non_visited_place = integration_client.post(
        "/places",
        json={
            "map_id": str(poi_map.id),
            "name": "Favori non visité",
            "status_id": non_visited_status["id"],
            "latitude": 48.15,
            "longitude": 2.15,
            "is_favorite": True,
        },
    ).json()

    details = integration_client.get(f"/places/{place_id}")
    assert details.status_code == 200
    assert details.json()["is_favorite"] is True
    assert details.json()["interest_rating"] == 4.5
    assert details.json()["visit_rating"] == 3.5
    assert details.json()["is_visited"] is True

    filtered = integration_client.get(
        "/places",
        params={"map_id": str(poi_map.id), "is_favorite": True, "functional_state": "visited", "rating_min": 3.5},
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()] == [place_id]

    invalid_rating = integration_client.patch(f"/places/{place_id}", json={"visit_rating": 3.25})
    assert invalid_rating.status_code == 422

    map_filtered = integration_client.get(
        "/places/map",
        params={
            "map_id": str(poi_map.id),
            "min_latitude": 47,
            "max_latitude": 49,
            "min_longitude": 1,
            "max_longitude": 3,
            "is_favorite": True,
            "functional_state": "visited",
        },
    )
    assert map_filtered.status_code == 200
    assert map_filtered.json()[0]["id"] == place_id

    combined = integration_client.get(
        "/places",
        params={"map_id": str(poi_map.id), "is_favorite": True, "functional_state": "non_visited"},
    )
    assert [item["id"] for item in combined.json()] == [non_visited_place["id"]]

    multiple_statuses = integration_client.get(
        "/places",
        params=[
            ("map_id", str(poi_map.id)),
            ("is_favorite", "true"),
            ("status_ids", visited_status["id"]),
            ("status_ids", non_visited_status["id"]),
        ],
    )
    assert {item["id"] for item in multiple_statuses.json()} == {place_id, non_visited_place["id"]}

    facets = integration_client.get("/places/facets", params={"map_id": str(poi_map.id)})
    assert facets.status_code == 200
    assert facets.json()["total"] == 2
    assert facets.json()["visited"] == 1
    assert facets.json()["non_visited"] == 1
    assert facets.json()["favorites"] == 2

    invalid_link = integration_client.post(
        f"/places/{place_id}/links", json={"url": "javascript:alert(1)"}
    )
    assert invalid_link.status_code == 422
    link = integration_client.post(
        f"/places/{place_id}/links",
        json={"url": "https://example.org/fiche", "label": "Fiche externe"},
    )
    assert link.status_code == 201
    assert integration_client.get(f"/places/{place_id}").json()["links"][0]["label"] == "Fiche externe"

    history = integration_client.get(f"/places/{place_id}/history")
    assert history.status_code == 200
    assert {event["action"] for event in history.json()} >= {"created", "link_added"}


def test_map_field_configuration_and_trash_lifecycle(integration_client, poi_map) -> None:
    configured = integration_client.put(
        f"/maps/{poi_map.id}/place-fields",
        json={"fields": {"description": False, "region": False, "favorite": True}},
    )
    assert configured.status_code == 200
    assert configured.json()["fields"]["description"] is False
    assert configured.json()["fields"]["favorite"] is True

    place = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "À restaurer", "latitude": 48.2, "longitude": 2.2},
    ).json()
    place_id = place["id"]
    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    assert integration_client.get(f"/places/{place_id}").status_code == 404
    assert all(item["id"] != place_id for item in integration_client.get("/places", params={"map_id": str(poi_map.id)}).json())

    trash = integration_client.get("/places/trash", params={"map_id": str(poi_map.id)})
    assert trash.status_code == 200
    assert [item["id"] for item in trash.json()] == [place_id]
    assert integration_client.post(f"/places/{place_id}/restore").status_code == 200
    assert integration_client.get(f"/places/{place_id}").status_code == 200

    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    assert integration_client.delete(f"/places/{place_id}/permanent").status_code == 204
    assert integration_client.get("/places/trash", params={"map_id": str(poi_map.id)}).json() == []


def test_advanced_place_permissions_do_not_leak_resources(integration_client, database_session, auth_user, poi_map) -> None:
    place = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "Protégé", "latitude": 48.3, "longitude": 2.3},
    ).json()
    place_id = place["id"]
    viewer = User(email="advanced-viewer@example.test", display_name="Viewer", password_hash="x", is_active=True, is_admin=False)
    outsider = User(email="advanced-outsider@example.test", display_name="Outsider", password_hash="x", is_active=True, is_admin=False)
    database_session.add_all([viewer, outsider])
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"))
    database_session.flush()

    try:
        app.dependency_overrides[get_current_user] = lambda: viewer
        assert integration_client.get(f"/places/{place_id}").status_code == 200
        assert integration_client.get(f"/places/{place_id}/history").status_code == 200
        assert integration_client.patch(f"/places/{place_id}", json={"is_favorite": True}).status_code == 403
        assert integration_client.post(f"/places/{place_id}/links", json={"url": "https://example.org"}).status_code == 403
        assert integration_client.put(f"/maps/{poi_map.id}/place-fields", json={"fields": {"favorite": False}}).status_code == 403

        app.dependency_overrides[get_current_user] = lambda: outsider
        assert integration_client.get(f"/places/{place_id}").status_code == 404
        assert integration_client.get(f"/places/{place_id}/history").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user
