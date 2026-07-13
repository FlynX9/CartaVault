from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.maps.models import PoiMap


pytestmark = pytest.mark.integration


def test_place_crud_uses_map_and_map_filters(integration_client: TestClient, poi_map: PoiMap) -> None:
    payload = {"name": f"Pytest Place {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 48.8566, "longitude": 2.3522, "region": "Île-de-France"}
    created = integration_client.post("/places", json=payload)
    assert created.status_code == 201
    place = created.json()
    assert place["map_id"] == str(poi_map.id)
    assert place["map"]["country"]["iso_alpha3"] == "FRA"
    assert "country" not in place

    listed = integration_client.get("/places", params={"map_id": str(poi_map.id)})
    assert place["id"] in {item["id"] for item in listed.json()}
    assert all("country" not in item for item in listed.json())

    markers = integration_client.get("/places/map", params={"map_id": str(poi_map.id), "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3})
    assert markers.status_code == 200
    assert markers.json()[0]["map_id"] == str(poi_map.id)


def test_place_rejects_missing_map(integration_client: TestClient) -> None:
    response = integration_client.post("/places", json={"name": "Unknown map", "map_id": str(uuid4()), "latitude": 48, "longitude": 2})
    assert response.status_code == 404
