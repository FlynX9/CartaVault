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

    markers_with_meta = integration_client.get(
        "/places/map",
        params={
            "map_id": str(poi_map.id),
            "min_latitude": 48,
            "max_latitude": 49,
            "min_longitude": 2,
            "max_longitude": 3,
            "limit": 1,
            "include_meta": "true",
        },
    )
    assert markers_with_meta.status_code == 200
    payload = markers_with_meta.json()
    assert payload["returned"] == 1
    assert payload["total"] >= payload["returned"]
    assert payload["truncated"] is (payload["total"] > payload["returned"])


def test_place_rejects_missing_map(integration_client: TestClient) -> None:
    response = integration_client.post("/places", json={"name": "Unknown map", "map_id": str(uuid4()), "latitude": 48, "longitude": 2})
    assert response.status_code == 404


def test_bulk_place_delete_and_validated_filters(integration_client: TestClient, poi_map: PoiMap) -> None:
    first = integration_client.post("/places", json={"name": f"Bulk alpha {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1})
    second = integration_client.post("/places", json={"name": f"Bulk beta {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.2, "longitude": 2.2})
    assert first.status_code == second.status_code == 201

    searched = integration_client.get("/places", params={"map_id": str(poi_map.id), "q": "Bulk alpha"})
    assert [item["id"] for item in searched.json()] == [first.json()["id"]]
    invalid_dates = integration_client.get("/places", params={"created_from": "2026-07-20", "created_to": "2026-07-19"})
    assert invalid_dates.status_code == 422

    deleted = integration_client.post("/places/bulk", json={"place_ids": [first.json()["id"], second.json()["id"]], "action": "delete"})
    assert deleted.status_code == 200
    assert deleted.json() == {"selected_count": 2, "updated_count": 0, "unchanged_count": 0, "deleted_count": 2}


def test_place_facets_and_bulk_trip_add_are_map_scoped(integration_client: TestClient, poi_map: PoiMap) -> None:
    first = integration_client.post("/places", json={"name": f"Facet one {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1, "region": "Centre"})
    second = integration_client.post("/places", json={"name": f"Facet two {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.2, "longitude": 2.2, "region": "Centre"})
    assert first.status_code == second.status_code == 201
    facets = integration_client.get("/places/facets", params={"map_id": str(poi_map.id)})
    assert facets.status_code == 200
    assert facets.json()["with_coordinates"] >= 2
    assert facets.json()["regions"] == [{"id": None, "name": None, "value": "Centre", "icon": None, "color": None, "count": 2}]

    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Bulk trip"})
    assert trip.status_code == 201
    day_id = trip.json()["days"][0]["id"]
    added = integration_client.post("/places/bulk/add-to-trip", json={"place_ids": [first.json()["id"], second.json()["id"]], "trip_id": trip.json()["id"], "day_id": day_id})
    assert added.status_code == 200
    assert added.json() == {"selected_count": 2, "added_count": 2, "duplicate_count": 0}
    duplicate = integration_client.post("/places/bulk/add-to-trip", json={"place_ids": [first.json()["id"], second.json()["id"]], "trip_id": trip.json()["id"], "day_id": day_id})
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate_count"] == 2


def test_place_list_position_uses_the_same_filtered_stable_order(integration_client: TestClient, poi_map: PoiMap) -> None:
    token = uuid4().hex
    created = []
    for name in (f"{token} alpha", f"{token} bravo", f"{token} charlie"):
        response = integration_client.post(
            "/places",
            json={"name": name, "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1},
        )
        assert response.status_code == 201
        created.append(response.json())

    position = integration_client.get(
        f"/places/{created[1]['id']}/list-position",
        params={"map_id": str(poi_map.id), "q": token, "page_size": 2},
    )
    assert position.status_code == 200
    assert position.json() == {
        "place_id": created[1]["id"],
        "matches_filters": True,
        "index": 1,
        "page": 0,
        "page_size": 2,
    }

    filtered_out = integration_client.get(
        f"/places/{created[1]['id']}/list-position",
        params={"map_id": str(poi_map.id), "q": "does-not-match", "page_size": 2},
    )
    assert filtered_out.status_code == 200
    assert filtered_out.json()["matches_filters"] is False
    assert filtered_out.json()["index"] is None
