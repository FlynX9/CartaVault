from uuid import uuid4

import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.integration


def test_place_crud_filters_and_map_bounds(
    integration_client: TestClient,
) -> None:
    place_name = f"Pytest Place {uuid4().hex}"
    payload = {
        "name": place_name,
        "latitude": 48.8566,
        "longitude": 2.3522,
        "description": "Integration search description",
        "country": "France",
        "region": "Île-de-France",
    }

    created = integration_client.post("/places", json=payload)
    assert created.status_code == 201
    place = created.json()
    place_id = place["id"]
    assert "address" not in place
    assert "owner" not in place
    assert place["latitude"] == pytest.approx(payload["latitude"])
    assert place["longitude"] == pytest.approx(payload["longitude"])

    read = integration_client.get(f"/places/{place_id}")
    assert read.status_code == 200
    assert read.json()["name"] == place_name
    assert "address" not in read.json()
    assert "owner" not in read.json()

    updated = integration_client.patch(
        f"/places/{place_id}",
        json={"condition": "Restored"},
    )
    assert updated.status_code == 200
    assert updated.json()["condition"] == "Restored"
    assert "address" not in updated.json()
    assert "owner" not in updated.json()

    searched = integration_client.get(
        "/places",
        params={"q": "search description"},
    )
    assert searched.status_code == 200
    assert place_id in {item["id"] for item in searched.json()}
    assert all("address" not in item for item in searched.json())
    assert all("owner" not in item for item in searched.json())

    inside_map = integration_client.get(
        "/places/map",
        params={
            "min_latitude": 48.0,
            "max_latitude": 49.0,
            "min_longitude": 2.0,
            "max_longitude": 3.0,
        },
    )
    assert inside_map.status_code == 200
    assert place_id in {item["id"] for item in inside_map.json()}
    assert all("address" not in item for item in inside_map.json())
    assert all("owner" not in item for item in inside_map.json())

    filtered_map = integration_client.get(
        "/places/map",
        params={
            "country": "france",
            "min_latitude": 48.0,
            "max_latitude": 49.0,
            "min_longitude": 2.0,
            "max_longitude": 3.0,
        },
    )
    assert filtered_map.status_code == 200
    assert place_id in {item["id"] for item in filtered_map.json()}

    other_country_map = integration_client.get(
        "/places/map",
        params={
            "country": "Belgique",
            "min_latitude": 48.0,
            "max_latitude": 49.0,
            "min_longitude": 2.0,
            "max_longitude": 3.0,
        },
    )
    assert other_country_map.status_code == 200
    assert place_id not in {item["id"] for item in other_country_map.json()}

    outside_map = integration_client.get(
        "/places/map",
        params={
            "min_latitude": 40.0,
            "max_latitude": 41.0,
            "min_longitude": -4.0,
            "max_longitude": -3.0,
        },
    )
    assert outside_map.status_code == 200
    assert place_id not in {item["id"] for item in outside_map.json()}

    country_filter = integration_client.get(
        "/places",
        params={"country": "france"},
    )
    assert country_filter.status_code == 200
    assert place_id in {item["id"] for item in country_filter.json()}
