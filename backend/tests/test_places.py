from uuid import uuid4

import pytest
from sqlalchemy import event
from starlette.testclient import TestClient

from app.maps.models import PoiMap


pytestmark = pytest.mark.integration


def test_place_sorting_is_stable_and_missing_cities_are_last(integration_client: TestClient, poi_map: PoiMap) -> None:
    token = uuid4().hex
    for name, region in ((f"{token} zulu", "Zurich"), (f"{token} alpha", "Amsterdam"), (f"{token} no-city", None)):
        response = integration_client.post("/places", json={"name": name, "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1, "region": region})
        assert response.status_code == 201

    by_name = integration_client.get("/places", params={"map_id": str(poi_map.id), "q": token, "sort_by": "name", "sort_direction": "desc"})
    by_city = integration_client.get("/places", params={"map_id": str(poi_map.id), "q": token, "sort_by": "city", "sort_direction": "asc"})

    assert [item["name"] for item in by_name.json()] == [f"{token} zulu", f"{token} no-city", f"{token} alpha"]
    assert [item["region"] for item in by_city.json()] == ["Amsterdam", "Zurich", None]
    assert integration_client.get("/places", params={"map_id": str(poi_map.id), "sort_by": "invalid"}).status_code == 422


def test_place_crud_uses_map_and_map_filters(integration_client: TestClient, poi_map: PoiMap) -> None:
    payload = {"name": f"Pytest Place {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 48.8566, "longitude": 2.3522, "region": "Île-de-France"}
    created = integration_client.post("/places", json=payload)
    assert created.status_code == 201
    place = created.json()
    assert place["map_id"] == str(poi_map.id)
    assert place["map"]["country"]["iso_alpha3"] == "FRA"
    assert place["country"] is None
    assert place["country_code"] is None

    listed = integration_client.get("/places", params={"map_id": str(poi_map.id)})
    assert place["id"] in {item["id"] for item in listed.json()}
    assert all(item["country"] is None for item in listed.json())

    markers = integration_client.get("/places/map", params={"map_id": str(poi_map.id), "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3})
    assert markers.status_code == 200
    marker = markers.json()[0]
    assert marker["map_id"] == str(poi_map.id)
    assert set(marker) == {
        "id",
        "map_id",
        "name",
        "longitude",
        "latitude",
        "status",
        "primary_category_icon",
        "primary_photo_id",
        "category_ids",
        "tag_ids",
        "is_favorite",
    }
    assert set(marker["status"]) == {"id", "color"}
    assert len(markers.content) < len(created.content)

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


def test_place_outside_map_country_requires_explicit_confirmation(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    payload = {
        "name": f"Outside France {uuid4().hex}",
        "map_id": str(poi_map.id),
        "latitude": 51.5074,
        "longitude": -0.1278,
    }

    warning = integration_client.post("/places", json=payload)

    assert warning.status_code == 409
    assert warning.json()["detail"]["code"] == "PLACE_OUTSIDE_MAP_COUNTRY"
    assert warning.json()["detail"]["country_code"] == "FRA"
    confirmed = integration_client.post(
        "/places",
        json={**payload, "confirm_outside_country": True},
    )
    assert confirmed.status_code == 201

    moved = integration_client.patch(
        f"/places/{confirmed.json()['id']}",
        json={"latitude": 52.52, "longitude": 13.405},
    )
    assert moved.status_code == 409
    confirmed_move = integration_client.patch(
        f"/places/{confirmed.json()['id']}",
        json={
            "latitude": 52.52,
            "longitude": 13.405,
            "confirm_outside_country": True,
        },
    )
    assert confirmed_move.status_code == 200


def test_place_status_update_is_audited_as_json(integration_client: TestClient, poi_map: PoiMap) -> None:
    statuses = integration_client.get("/statuses", params={"map_id": str(poi_map.id)}).json()
    initial_status, target_status = statuses[:2]
    created = integration_client.post(
        "/places",
        json={
            "name": f"Status audit {uuid4().hex}",
            "map_id": str(poi_map.id),
            "status_id": initial_status["id"],
            "latitude": 48.5,
            "longitude": 2.5,
        },
    )
    assert created.status_code == 201

    updated = integration_client.patch(
        f"/places/{created.json()['id']}",
        json={"status_id": target_status["id"]},
    )

    assert updated.status_code == 200
    assert updated.json()["status"]["id"] == target_status["id"]
    history = integration_client.get(f"/places/{created.json()['id']}/history")
    assert history.status_code == 200
    status_change = next(
        event["changes"]["status_id"]
        for event in history.json()["items"]
        if "status_id" in event["changes"]
    )
    assert status_change == {"old": initial_status["id"], "new": target_status["id"]}


def test_place_rename_refreshes_all_linked_trip_names(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    previous_name = f"Original place {uuid4().hex}"
    current_name = f"Renamed place {uuid4().hex}"
    place = integration_client.post(
        "/places",
        json={
            "name": previous_name,
            "map_id": str(poi_map.id),
            "latitude": 48.8566,
            "longitude": 2.3522,
        },
    ).json()
    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": f"Rename synchronization {uuid4().hex}"},
    ).json()
    first_day = trip["days"][0]
    second_day = integration_client.post(
        f"/trips/{trip['id']}/days",
        json={},
    ).json()

    linked_stop = integration_client.post(
        f"/trip-days/{first_day['id']}/stops",
        json={"place_id": place["id"]},
    ).json()
    stale_stop = integration_client.post(
        f"/trip-days/{first_day['id']}/stops",
        json={"place_id": place["id"]},
    ).json()
    assert integration_client.patch(
        f"/trip-stops/{stale_stop['id']}",
        json={"name": "Previously stale snapshot"},
    ).status_code == 200
    assert integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": first_day["id"],
            "next_day_id": second_day["id"],
            "place_id": place["id"],
        },
    ).status_code == 201
    assert integration_client.post(
        f"/trips/{trip['id']}/departure",
        json={"place_id": place["id"]},
    ).status_code == 201
    assert integration_client.post(
        f"/trips/{trip['id']}/arrival",
        json={"place_id": place["id"]},
    ).status_code == 201

    renamed = integration_client.patch(
        f"/places/{place['id']}",
        json={"name": current_name},
    )

    assert renamed.status_code == 200
    refreshed_trip = integration_client.get(f"/trips/{trip['id']}").json()
    refreshed_stops = {
        stop["id"]: stop["name"]
        for day in refreshed_trip["days"]
        for stop in day["stops"]
    }
    assert refreshed_stops[linked_stop["id"]] == current_name
    assert refreshed_stops[stale_stop["id"]] == current_name
    assert refreshed_trip["nights"][0]["name"] == current_name
    assert refreshed_trip["departure"]["name"] == current_name
    assert refreshed_trip["arrival"]["name"] == current_name


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


def test_bulk_set_category_replaces_the_existing_category(integration_client: TestClient, poi_map: PoiMap) -> None:
    first_category = integration_client.post(
        "/categories",
        json={"map_id": str(poi_map.id), "name": f"Bulk initial {uuid4().hex}"},
    )
    replacement_category = integration_client.post(
        "/categories",
        json={"map_id": str(poi_map.id), "name": f"Bulk replacement {uuid4().hex}"},
    )
    place = integration_client.post(
        "/places",
        json={"name": f"Bulk category {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1},
    )
    assert first_category.status_code == replacement_category.status_code == place.status_code == 201
    assert integration_client.post(
        f"/places/{place.json()['id']}/categories/{first_category.json()['id']}",
    ).status_code == 200

    replaced = integration_client.post(
        "/places/bulk",
        json={
            "place_ids": [place.json()["id"]],
            "action": "set_category",
            "category_id": replacement_category.json()["id"],
        },
    )

    assert replaced.status_code == 200
    categories = integration_client.get(f"/places/{place.json()['id']}").json()["categories"]
    assert [(item["id"], item["is_primary"]) for item in categories] == [
        (replacement_category.json()["id"], True),
    ]


def test_bulk_adds_and_removes_multiple_tags_atomically(integration_client: TestClient, poi_map: PoiMap) -> None:
    first_tag = integration_client.post(
        "/tags",
        json={"map_id": str(poi_map.id), "name": f"Bulk tag one {uuid4().hex}"},
    )
    second_tag = integration_client.post(
        "/tags",
        json={"map_id": str(poi_map.id), "name": f"Bulk tag two {uuid4().hex}"},
    )
    place = integration_client.post(
        "/places",
        json={"name": f"Bulk tags {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1},
    )
    assert first_tag.status_code == second_tag.status_code == place.status_code == 201
    tag_ids = [first_tag.json()["id"], second_tag.json()["id"]]

    added = integration_client.post(
        "/places/bulk",
        json={"place_ids": [place.json()["id"]], "action": "add_tag", "tag_ids": tag_ids},
    )
    assert added.status_code == 200
    assert added.json()["updated_count"] == 1
    assert {tag["id"] for tag in integration_client.get(f"/places/{place.json()['id']}").json()["tags"]} == set(tag_ids)

    removed = integration_client.post(
        "/places/bulk",
        json={"place_ids": [place.json()["id"]], "action": "remove_tag", "tag_ids": tag_ids},
    )
    assert removed.status_code == 200
    assert removed.json()["updated_count"] == 1
    assert integration_client.get(f"/places/{place.json()['id']}").json()["tags"] == []


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
    repeated = integration_client.post("/places/bulk/add-to-trip", json={"place_ids": [first.json()["id"], second.json()["id"]], "trip_id": trip.json()["id"], "day_id": day_id})
    assert repeated.status_code == 200
    assert repeated.json() == {"selected_count": 2, "added_count": 2, "duplicate_count": 0}
    refreshed = integration_client.get(f"/trips/{trip.json()['id']}")
    assert refreshed.status_code == 200
    assert [stop["place_id"] for stop in refreshed.json()["days"][0]["stops"]].count(first.json()["id"]) == 2


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


def test_place_list_batches_primary_category_lookups(
    integration_client: TestClient,
    database_session,
    poi_map: PoiMap,
) -> None:
    category = integration_client.post(
        "/categories",
        json={"map_id": str(poi_map.id), "name": f"Performance {uuid4().hex}"},
    )
    assert category.status_code == 201
    places = [
        integration_client.post(
            "/places",
            json={"name": f"Batched primary {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 47.1, "longitude": 2.1},
        ).json()
        for _ in range(3)
    ]
    for place in places:
        assigned = integration_client.post(
            f"/places/{place['id']}/categories/{category.json()['id']}",
        )
        assert assigned.status_code == 200

    statements: list[str] = []

    def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement)

    event.listen(database_session.bind, "before_cursor_execute", record_statement)
    try:
        listed = integration_client.get("/places", params={"map_id": str(poi_map.id), "limit": 100})
    finally:
        event.remove(database_session.bind, "before_cursor_execute", record_statement)

    assert listed.status_code == 200
    primary_queries = [
        statement
        for statement in statements
        if "place_categories" in statement and "is_primary" in statement
    ]
    assert len(primary_queries) == 1
