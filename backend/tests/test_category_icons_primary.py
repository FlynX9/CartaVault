from uuid import uuid4

import pytest
from sqlalchemy import text


pytestmark = pytest.mark.integration


def test_category_icons_and_primary_category_lifecycle(integration_client, poi_map, database_session) -> None:
    first = integration_client.post("/categories", json={"name": f"Factory {uuid4().hex}", "icon": "factory"})
    second = integration_client.post("/categories", json={"name": f"Castle {uuid4().hex}"})
    assert first.status_code == second.status_code == 201
    assert first.json()["icon"] == "factory"
    assert second.json()["icon"] == "map-pin"
    assert integration_client.post("/categories", json={"name": "Invalid", "icon": ""}).status_code == 422
    assert integration_client.post("/categories", json={"name": "Unknown", "icon": "remote-url"}).status_code == 422
    assert integration_client.patch(f"/categories/{second.json()['id']}", json={"icon": "castle"}).json()["icon"] == "castle"

    place = integration_client.post("/places", json={"name": f"Primary {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1}).json()
    place_id = place["id"]
    assert integration_client.post(f"/places/{place_id}/categories/{first.json()['id']}").status_code == 200
    assert integration_client.post(f"/places/{place_id}/categories/{second.json()['id']}").status_code == 200
    detail = integration_client.get(f"/places/{place_id}").json()
    assert [item["is_primary"] for item in detail["categories"]].count(True) == 1
    assert next(item for item in detail["categories"] if item["is_primary"])["id"] == first.json()["id"]
    assert integration_client.patch(f"/places/{place_id}/categories/{second.json()['id']}", json={"is_primary": True}).status_code == 200
    assert integration_client.patch(f"/places/{place_id}/categories/{second.json()['id']}", json={"is_primary": True}).status_code == 200
    assert integration_client.delete(f"/places/{place_id}/categories/{second.json()['id']}").status_code == 204
    detail = integration_client.get(f"/places/{place_id}").json()
    assert next(item for item in detail["categories"] if item["is_primary"])["id"] == first.json()["id"]
    markers = integration_client.get("/places/map", params={"map_id": str(poi_map.id), "category_id": first.json()["id"], "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3}).json()
    assert markers[0]["primary_category"]["icon"] == "factory"
    assert database_session.execute(text("SELECT count(*) FROM place_categories WHERE place_id = :id AND is_primary"), {"id": place_id}).scalar() == 1
