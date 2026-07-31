from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.countries.models import Country
from app.maps.models import PoiMap


pytestmark = pytest.mark.integration


def test_country_catalog_list_search_codes_and_read(integration_client: TestClient, france_country: Country) -> None:
    assert integration_client.get("/countries", params={"q": "France"}).json()[0]["iso_alpha3"] == "FRA"
    assert integration_client.get("/countries", params={"q": "FR"}).status_code == 200
    read = integration_client.get(f"/countries/{france_country.id}")
    assert read.status_code == 200
    assert read.json()["name"] == "France"
    boundary = integration_client.get(f"/countries/{france_country.id}/boundary")
    assert boundary.status_code == 200
    assert boundary.json()["iso_alpha3"] == "FRA"
    assert boundary.json()["geometry"]["type"] == "MultiPolygon"
    assert boundary.json()["point_count"] <= 15_000
    assert boundary.headers["cache-control"] == "private, max-age=86400"
    cached = integration_client.get(
        f"/countries/{france_country.id}/boundary",
        headers={"If-None-Match": boundary.headers["etag"]},
    )
    assert cached.status_code == 304


def test_map_crud_conflict_and_empty_delete(integration_client: TestClient, france_country: Country) -> None:
    created = integration_client.post("/maps", json={"country_id": str(france_country.id)})
    assert created.status_code == 201
    map_id = created.json()["id"]
    assert created.json()["effective_center_latitude"] == france_country.center_latitude
    assert integration_client.post("/maps", json={"country_id": str(france_country.id)}).status_code == 409
    assert integration_client.get(f"/maps/{map_id}").status_code == 200
    assert integration_client.patch(f"/maps/{map_id}", json={"name": "Carte France"}).json()["name"] == "Carte France"
    assert integration_client.delete(f"/maps/{map_id}").status_code == 204


def test_map_catalog_exposes_active_place_and_trip_counts(integration_client: TestClient, poi_map: PoiMap) -> None:
    active_place = integration_client.post(
        "/places",
        json={"name": "Active POI", "map_id": str(poi_map.id), "latitude": 48, "longitude": 2},
    )
    deleted_place = integration_client.post(
        "/places",
        json={"name": "Deleted POI", "map_id": str(poi_map.id), "latitude": 49, "longitude": 3},
    )
    active_trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Active trip"})
    deleted_trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Deleted trip"})
    assert active_place.status_code == deleted_place.status_code == 201
    assert active_trip.status_code == deleted_trip.status_code == 201
    assert integration_client.delete(f"/places/{deleted_place.json()['id']}").status_code == 204
    assert integration_client.delete(f"/trips/{deleted_trip.json()['id']}").status_code == 204

    catalogue_entry = next(item for item in integration_client.get("/maps").json() if item["id"] == str(poi_map.id))
    assert catalogue_entry["place_count"] == 1
    assert catalogue_entry["trip_count"] == 1
    detail = integration_client.get(f"/maps/{poi_map.id}").json()
    assert detail["place_count"] == 1
    assert detail["trip_count"] == 1


def test_map_with_place_moves_to_trash_and_restores_with_its_content(integration_client: TestClient, poi_map: PoiMap) -> None:
    place = integration_client.post("/places", json={"name": "Protected", "map_id": str(poi_map.id), "latitude": 48, "longitude": 2})
    assert place.status_code == 201
    place_id = place.json()["id"]
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    assert integration_client.get(f"/maps/{poi_map.id}").status_code == 404
    assert integration_client.get(f"/places/{place_id}").status_code == 404
    assert integration_client.post(f"/trash/map/{poi_map.id}/restore").status_code == 204
    assert integration_client.get(f"/maps/{poi_map.id}").status_code == 200
    assert integration_client.get(f"/places/{place_id}").status_code == 200
    assert integration_client.get(f"/places/{place.json()['id']}").status_code == 200


def test_invalid_map_uuid_is_rejected(integration_client: TestClient) -> None:
    assert integration_client.get("/maps/not-a-uuid").status_code == 422
    assert integration_client.get(f"/maps/{uuid4()}").status_code == 404
