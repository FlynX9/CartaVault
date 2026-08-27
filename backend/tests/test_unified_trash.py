from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.places.models import Place
from app.trash.service import trash_deadline


pytestmark = pytest.mark.integration


def test_unified_trash_lists_and_restores_places_and_trips(
    integration_client,
    poi_map,
) -> None:
    place = integration_client.post(
        "/places",
        json={
            "map_id": str(poi_map.id),
            "name": "Recoverable place",
            "latitude": 48.2,
            "longitude": 2.2,
        },
    )
    assert place.status_code == 201
    place_id = place.json()["id"]

    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": "Recoverable trip"},
    )
    assert trip.status_code == 201
    trip_id = trip.json()["id"]

    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    assert integration_client.delete(f"/trips/{trip_id}").status_code == 204
    assert integration_client.get(f"/places/{place_id}").status_code == 404
    assert integration_client.get(f"/trips/{trip_id}").status_code == 404

    response = integration_client.get("/trash")
    assert response.status_code == 200
    items = response.json()
    assert {(item["item_type"], item["id"]) for item in items} == {
        ("place", place_id),
        ("trip", trip_id),
    }
    assert all(item["days_remaining"] == 30 for item in items)

    assert integration_client.post(f"/trash/place/{place_id}/restore").status_code == 204
    assert integration_client.post(f"/trash/trip/{trip_id}/restore").status_code == 204
    assert integration_client.get(f"/places/{place_id}").status_code == 200
    assert integration_client.get(f"/trips/{trip_id}").status_code == 200
    assert integration_client.get("/trash").json() == []

    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    assert integration_client.delete(f"/trash/place/{place_id}").status_code == 204
    assert integration_client.get(f"/places/{place_id}").status_code == 404


def test_deleted_map_is_hidden_and_can_be_restored(
    integration_client,
    poi_map,
) -> None:
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    assert integration_client.get(f"/maps/{poi_map.id}").status_code == 404
    assert all(item["id"] != str(poi_map.id) for item in integration_client.get("/maps").json())

    trash = integration_client.get("/trash", params={"item_type": "map"})
    assert trash.status_code == 200
    assert [(item["item_type"], item["id"]) for item in trash.json()] == [
        ("map", str(poi_map.id)),
    ]

    assert integration_client.post(f"/trash/map/{poi_map.id}/restore").status_code == 204
    assert integration_client.get(f"/maps/{poi_map.id}").status_code == 200


def test_retention_preference_controls_the_purge_deadline(auth_user) -> None:
    auth_user.preferences = {"trash_retention_days": 14}
    deleted_at, purge_after = trash_deadline(
        auth_user,
        now=datetime(2026, 1, 1, 12, 0, 0),
    )
    assert (purge_after - deleted_at).days == 14


def test_get_trash_does_not_trigger_expired_purge(
    integration_client,
    database_session,
    poi_map,
    monkeypatch,
) -> None:
    created = integration_client.post(
        "/places",
        json={
            "map_id": str(poi_map.id),
            "name": "Expired but read-only",
            "latitude": 48.2,
            "longitude": 2.2,
        },
    )
    place_id = created.json()["id"]
    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    place = database_session.get(Place, place_id)
    assert place is not None
    place.purge_after = place.deleted_at - timedelta(seconds=1)
    database_session.commit()

    calls = 0

    def unexpected_purge(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return {"maps": 0, "trips": 0, "places": 0}

    monkeypatch.setattr("app.trash.service.purge_expired_trash", unexpected_purge)

    response = integration_client.get("/trash")

    assert response.status_code == 200
    assert calls == 0
    assert database_session.get(Place, place_id) is not None
