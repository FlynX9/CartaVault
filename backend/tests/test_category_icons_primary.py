from uuid import uuid4

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.integration


def test_imported_category_cannot_be_deleted(integration_client, poi_map) -> None:
    created = integration_client.post(
        "/categories",
        json={"map_id": str(poi_map.id), "name": "Importé"},
    )
    assert created.status_code == 201

    deleted = integration_client.delete(f"/categories/{created.json()['id']}")

    assert deleted.status_code == 409
    assert integration_client.get(f"/categories/{created.json()['id']}").status_code == 200


def test_category_icons_and_primary_category_lifecycle(integration_client, poi_map, database_session) -> None:
    map_id = str(poi_map.id)
    first = integration_client.post("/categories", json={"map_id": map_id, "name": f"Factory {uuid4().hex}", "icon": "mdi:church"})
    second = integration_client.post("/categories", json={"map_id": map_id, "name": f"Castle {uuid4().hex}"})
    fallback = integration_client.post("/categories", json={"map_id": map_id, "name": f"Fallback {uuid4().hex}", "icon": "material-symbols:help-outline"})
    assert first.status_code == second.status_code == 201
    assert fallback.status_code == 201
    assert first.json()["icon"] == "mdi:church"
    assert second.json()["icon"] == "material-symbols:location-on-outline"
    assert fallback.json()["icon"] == "material-symbols:help-outline"
    assert integration_client.get(f"/categories/{first.json()['id']}").json()["icon"] == "mdi:church"
    assert integration_client.post("/categories", json={"map_id": map_id, "name": "Invalid", "icon": ""}).status_code == 422
    assert integration_client.post("/categories", json={"map_id": map_id, "name": "Legacy", "icon": "church"}).status_code == 422
    assert integration_client.post("/categories", json={"map_id": map_id, "name": "Legacy default", "icon": "map-pin"}).status_code == 422
    assert integration_client.post("/categories", json={"map_id": map_id, "name": "Unknown", "icon": "mdi:not-installed"}).status_code == 422
    assert integration_client.post("/categories", json={"map_id": map_id, "name": "Null", "icon": None}).status_code == 422
    assert integration_client.patch(f"/categories/{second.json()['id']}", json={"icon": "mdi:castle"}).json()["icon"] == "mdi:castle"
    assert integration_client.patch(f"/categories/{second.json()['id']}", json={"name": "Updated castle"}).json()["icon"] == "mdi:castle"
    assert integration_client.patch(f"/categories/{second.json()['id']}", json={"icon": None}).status_code == 422

    place = integration_client.post("/places", json={"name": f"Primary {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1}).json()
    place_id = place["id"]
    assert integration_client.post(f"/places/{place_id}/categories/{first.json()['id']}").status_code == 200
    assert integration_client.post(f"/places/{place_id}/categories/{second.json()['id']}").status_code == 200
    tag = integration_client.post("/tags", json={"map_id": map_id, "name": f"Usage tag {uuid4().hex}"})
    assert tag.status_code == 201
    assert integration_client.post(f"/places/{place_id}/tags/{tag.json()['id']}").status_code == 200
    category_counts = {item["id"]: item["places_count"] for item in integration_client.get("/categories", params={"map_id": map_id}).json()}
    tag_counts = {item["id"]: item["places_count"] for item in integration_client.get("/tags", params={"map_id": map_id}).json()}
    assert category_counts[first.json()["id"]] == 1
    assert category_counts[second.json()["id"]] == 1
    assert tag_counts[tag.json()["id"]] == 1
    detail = integration_client.get(f"/places/{place_id}").json()
    assert [item["is_primary"] for item in detail["categories"]].count(True) == 1
    assert next(item for item in detail["categories"] if item["is_primary"])["id"] == first.json()["id"]
    assert integration_client.patch(f"/places/{place_id}/categories/{second.json()['id']}", json={"is_primary": True}).status_code == 200
    assert integration_client.patch(f"/places/{place_id}/categories/{second.json()['id']}", json={"is_primary": True}).status_code == 200
    assert integration_client.delete(f"/places/{place_id}/categories/{second.json()['id']}").status_code == 204
    detail = integration_client.get(f"/places/{place_id}").json()
    assert next(item for item in detail["categories"] if item["is_primary"])["id"] == first.json()["id"]
    markers = integration_client.get("/places/map", params={"map_id": str(poi_map.id), "category_id": first.json()["id"], "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3}).json()
    assert markers[0]["primary_category_icon"] == "mdi:church"
    assert first.json()["id"] in markers[0]["category_ids"]
    assert tag.json()["id"] in markers[0]["tag_ids"]
    assert database_session.execute(text("SELECT count(*) FROM place_categories WHERE place_id = :id AND is_primary"), {"id": place_id}).scalar() == 1
