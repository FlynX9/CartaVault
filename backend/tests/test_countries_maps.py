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


def test_map_crud_conflict_and_empty_delete(integration_client: TestClient, france_country: Country) -> None:
    created = integration_client.post("/maps", json={"country_id": str(france_country.id)})
    assert created.status_code == 201
    map_id = created.json()["id"]
    assert created.json()["effective_center_latitude"] == france_country.center_latitude
    assert integration_client.post("/maps", json={"country_id": str(france_country.id)}).status_code == 409
    assert integration_client.get(f"/maps/{map_id}").status_code == 200
    assert integration_client.patch(f"/maps/{map_id}", json={"name": "Carte France"}).json()["name"] == "Carte France"
    assert integration_client.delete(f"/maps/{map_id}").status_code == 204


def test_map_with_place_cannot_be_deleted(integration_client: TestClient, poi_map: PoiMap) -> None:
    place = integration_client.post("/places", json={"name": "Protected", "map_id": str(poi_map.id), "latitude": 48, "longitude": 2})
    assert place.status_code == 201
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 409
    assert integration_client.get(f"/places/{place.json()['id']}").status_code == 200


def test_invalid_map_uuid_is_rejected(integration_client: TestClient) -> None:
    assert integration_client.get("/maps/not-a-uuid").status_code == 422
    assert integration_client.get(f"/maps/{uuid4()}").status_code == 404
