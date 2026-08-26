from uuid import uuid4

import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.integration


def _trip(client: TestClient, poi_map) -> dict:
    response = client.post(f"/maps/{poi_map.id}/trips", json={"name": f"Lifecycle {uuid4()}"})
    assert response.status_code == 201
    return response.json()


def _complete(client: TestClient, trip_id: str) -> None:
    response = client.post(f"/trips/{trip_id}/archive")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def _read_only(response) -> None:
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "TRIP_COMPLETED_READ_ONLY"


def test_completed_trip_blocks_structure_but_keeps_documentary_fields(integration_client: TestClient, poi_map) -> None:
    trip = _trip(integration_client, poi_map)
    day = trip["days"][0]
    stop = integration_client.post(
        f"/trip-days/{day['id']}/stops",
        json={"stop_type": "free_location", "name": "Étape", "latitude": 48.0, "longitude": 2.0},
    ).json()
    _complete(integration_client, trip["id"])

    _read_only(integration_client.post(f"/trip-days/{day['id']}/stops", json={"stop_type": "free_location", "name": "Refus", "latitude": 48.1, "longitude": 2.1}))
    _read_only(integration_client.delete(f"/trip-stops/{stop['id']}"))
    _read_only(integration_client.post(f"/trips/{trip['id']}/days/reorder", json={"ids": [day["id"]]}))
    _read_only(integration_client.patch(f"/trips/{trip['id']}", json={"start_date": "2026-08-01"}))
    _read_only(integration_client.patch(f"/trips/{trip['id']}", json={"description": "Carnet", "start_date": "2026-08-01"}))
    _read_only(integration_client.patch(f"/trip-days/{day['id']}/timing", json={"target_arrival_time": None, "default_stop_buffer_minutes": 0, "safety_margin_type": "fixed", "safety_margin_value": 0}))
    _read_only(integration_client.patch(f"/trip-stops/{stop['id']}", json={"name": "Renommage interdit"}))

    documented_trip = integration_client.patch(f"/trips/{trip['id']}", json={"description": "Carnet"})
    documented_day = integration_client.patch(f"/trip-days/{day['id']}", json={"title": "Journal", "notes": "Notes", "color": "#2563EB"})
    documented_stop = integration_client.patch(f"/trip-stops/{stop['id']}", json={"notes": "Visite effectuée", "visit_status": "visited"})

    assert documented_trip.status_code == documented_day.status_code == documented_stop.status_code == 200
    assert documented_trip.json()["description"] == "Carnet"
    assert documented_stop.json()["visit_status"] == "visited"


def test_completed_trip_blocks_restore_nights_anchors_and_bulk_add(integration_client: TestClient, poi_map) -> None:
    trip = _trip(integration_client, poi_map)
    day = trip["days"][0]
    snapshot = integration_client.get(f"/trips/{trip['id']}").json()
    place = integration_client.post("/places", json={"name": "Bulk lifecycle", "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1}).json()
    _complete(integration_client, trip["id"])

    _read_only(integration_client.put(f"/trips/{trip['id']}/state", json=snapshot))
    _read_only(integration_client.post(f"/trips/{trip['id']}/nights", json={"previous_day_id": day["id"], "next_day_id": day["id"], "name": "Nuit", "latitude": 48.1, "longitude": 2.1}))
    _read_only(integration_client.post(f"/trips/{trip['id']}/departure", json={"name": "Départ", "latitude": 48.1, "longitude": 2.1}))
    _read_only(integration_client.post("/places/bulk/add-to-trip", json={"place_ids": [place["id"]], "trip_id": trip["id"], "day_id": day["id"]}))


def test_unarchive_restores_structural_mutability_and_completed_trip_can_duplicate_or_trash(integration_client: TestClient, poi_map) -> None:
    trip = _trip(integration_client, poi_map)
    _complete(integration_client, trip["id"])

    duplicate = integration_client.post(f"/trips/{trip['id']}/duplicate")
    trashed = integration_client.delete(f"/trips/{trip['id']}")

    assert duplicate.status_code == 201
    assert duplicate.json()["status"] == "draft"
    assert trashed.status_code == 204

    # Use the duplicate so the original can stay in the trash under the
    # normal policy while the explicit reopening path is verified.
    _complete(integration_client, duplicate.json()["id"])
    reopened = integration_client.post(f"/trips/{duplicate.json()['id']}/unarchive")
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "in_progress"
    added = integration_client.post(f"/trips/{duplicate.json()['id']}/days", json={})
    assert added.status_code == 201
