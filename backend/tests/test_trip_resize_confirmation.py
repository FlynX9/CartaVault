from app.trips import router as trips_router


def _trip_with_three_days(integration_client, poi_map):
    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": "Resize", "start_date": "2026-08-01"},
    ).json()
    integration_client.post(f"/trips/{trip['id']}/days", json={})
    integration_client.post(f"/trips/{trip['id']}/days", json={})
    return integration_client.get(f"/trips/{trip['id']}").json()


def test_empty_tail_days_shrink_without_confirmation(integration_client, poi_map, monkeypatch) -> None:
    trip = _trip_with_three_days(integration_client, poi_map)
    lock_calls = []
    original_lock = trips_router._lock_trip_resize_graph
    monkeypatch.setattr(trips_router, "_lock_trip_resize_graph", lambda *args: lock_calls.append(args) or original_lock(*args))

    response = integration_client.patch(f"/trips/{trip['id']}", json={"end_date": "2026-08-01"})

    assert response.status_code == 200
    assert len(response.json()["days"]) == 1
    assert lock_calls == []


def test_destructive_shrink_requires_matching_confirmation_before_any_mutation(integration_client, poi_map, monkeypatch) -> None:
    trip = _trip_with_three_days(integration_client, poi_map)
    removed_day = trip["days"][-1]
    integration_client.post(
        f"/trip-days/{removed_day['id']}/stops",
        json={"stop_type": "free_location", "name": "Stop", "latitude": 48.2, "longitude": 6.4},
    )
    lock_calls = []
    original_lock = trips_router._lock_trip_resize_graph
    monkeypatch.setattr(trips_router, "_lock_trip_resize_graph", lambda *args: lock_calls.append(args) or original_lock(*args))

    required = integration_client.patch(
        f"/trips/{trip['id']}",
        json={"name": "Confirmed resize", "end_date": "2026-08-01"},
    )

    assert required.status_code == 409
    detail = required.json()["detail"]
    assert detail["code"] == "TRIP_RESIZE_CONFIRMATION_REQUIRED"
    assert detail["impact"]["removed_day_count"] == 2
    assert detail["impact"]["removed_stop_count"] == 1
    assert len(lock_calls) == 1
    unchanged = integration_client.get(f"/trips/{trip['id']}").json()
    assert unchanged["name"] == "Resize"
    assert len(unchanged["days"]) == 3

    stale = integration_client.patch(
        f"/trips/{trip['id']}",
        json={"name": "Different payload", "end_date": "2026-08-01", "destructive_change_token": detail["confirmation_token"]},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "TRIP_RESIZE_CONFIRMATION_STALE"

    confirmed = integration_client.patch(
        f"/trips/{trip['id']}",
        json={"name": "Confirmed resize", "end_date": "2026-08-01", "destructive_change_token": detail["confirmation_token"]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["name"] == "Confirmed resize"
    assert len(confirmed.json()["days"]) == 1


def test_resize_confirmation_rejects_a_tampered_expiration(integration_client, poi_map) -> None:
    trip = _trip_with_three_days(integration_client, poi_map)
    integration_client.post(
        f"/trip-days/{trip['days'][-1]['id']}/stops",
        json={"stop_type": "free_location", "name": "Stop", "latitude": 48.2, "longitude": 6.4},
    )
    required = integration_client.patch(f"/trips/{trip['id']}", json={"end_date": "2026-08-01"})
    token = required.json()["detail"]["confirmation_token"]
    version, _, fingerprint = token.split(".", 2)

    response = integration_client.patch(
        f"/trips/{trip['id']}",
        json={"end_date": "2026-08-01", "destructive_change_token": f"{version}.4102444800.{fingerprint}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "TRIP_RESIZE_CONFIRMATION_STALE"


def test_start_and_end_null_date_semantics_remain_unchanged(integration_client, poi_map) -> None:
    trip = _trip_with_three_days(integration_client, poi_map)

    end_null = integration_client.patch(f"/trips/{trip['id']}", json={"end_date": None})
    assert end_null.status_code == 200
    assert end_null.json()["end_date"] == "2026-08-03"

    start_null = integration_client.patch(f"/trips/{trip['id']}", json={"start_date": None})
    assert start_null.status_code == 200
    assert start_null.json()["end_date"] is None
    assert [day["date"] for day in start_null.json()["days"]] == [None, None, None]
