"""AUD-014: Place coordinate changes must sync trip snapshots and stale routes."""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from starlette.testclient import TestClient

from app.places.models import Place
from app.trips.models import TripDay, TripNight, TripStop

pytestmark = pytest.mark.integration


def create_place(client: TestClient, map_id, name: str) -> str:
    created = client.post(
        "/places",
        json={"name": name, "map_id": str(map_id), "latitude": 45.0, "longitude": 4.0},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def create_trip(client: TestClient, map_id) -> dict:
    created = client.post(f"/maps/{map_id}/trips", json={"name": f"Trip {uuid4()}"})
    assert created.status_code == 201, created.text
    return created.json()


def add_day(client: TestClient, trip_id: str) -> dict:
    created = client.post(f"/trips/{trip_id}/days", json={})
    assert created.status_code == 201, created.text
    return created.json()


def add_place_stop(client: TestClient, day_id: str, place_id: str) -> dict:
    created = client.post(f"/trip-days/{day_id}/stops", json={"place_id": place_id})
    assert created.status_code == 201, created.text
    return created.json()


def patch_place(client: TestClient, place_id: str, latitude: float, longitude: float) -> None:
    patched = client.patch(
        f"/places/{place_id}",
        json={"latitude": latitude, "longitude": longitude},
    )
    assert patched.status_code == 200, patched.text


def make_route_ready(session, day_id: str) -> None:
    day = session.get(TripDay, day_id)
    assert day is not None
    day.route_status = "ready"
    day.route_distance_meters = 1000.0
    day.route_duration_seconds = 60.0
    session.commit()


def stop_of(session, stop_id: str) -> TripStop:
    row = session.get(TripStop, stop_id)
    assert row is not None
    session.refresh(row)
    return row


def day_status(session, day_id: str) -> str | None:
    row = session.get(TripDay, day_id)
    assert row is not None
    session.refresh(row)
    return row.route_status


def test_place_as_stop_syncs_snapshot_and_stales_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_id = create_place(integration_client, poi_map.id, "Stop X")
    trip = create_trip(integration_client, poi_map.id)
    day_id = trip["days"][0]["id"]
    stop = add_place_stop(integration_client, day_id, place_id)
    make_route_ready(database_session, day_id)

    patch_place(integration_client, place_id, 46.5, 5.0)

    synced_stop = stop_of(database_session, stop["id"])
    assert synced_stop.latitude == pytest.approx(46.5)
    assert synced_stop.longitude == pytest.approx(5.0)
    assert synced_stop.place_id == UUID(place_id)
    assert day_status(database_session, day_id) == "stale"


def test_last_stop_boundary_stales_next_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_x = create_place(integration_client, poi_map.id, "Boundary X")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    add_place_stop(integration_client, day1, place_x)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    patch_place(integration_client, place_x, 47.0, 5.5)

    assert day_status(database_session, day1) == "stale"
    # No night bridges day 1 to day 2: its start basis moved too.
    assert day_status(database_session, day2) == "stale"


def test_intermediate_stop_keeps_next_day_ready(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_a = create_place(integration_client, poi_map.id, "Premier")
    place_x = create_place(integration_client, poi_map.id, "Intermédiaire X")
    place_c = create_place(integration_client, poi_map.id, "Dernier C")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    add_place_stop(integration_client, day1, place_a)
    add_place_stop(integration_client, day1, place_x)
    add_place_stop(integration_client, day1, place_c)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    patch_place(integration_client, place_x, 45.8, 4.4)

    assert day_status(database_session, day1) == "stale"
    # The boundary (last effective stop C) did not move.
    assert day_status(database_session, day2) == "ready"


def test_place_as_night_stales_both_days(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_h = create_place(integration_client, poi_map.id, "Hôtel H")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    created_night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": day1,
            "next_day_id": day2,
            "place_id": place_h,
        },
    )
    assert created_night.status_code == 201, created_night.text
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    patch_place(integration_client, place_h, 46.9, 5.2)

    night_row = database_session.scalars(select(TripNight)).one()
    database_session.refresh(night_row)
    assert night_row.latitude == pytest.approx(46.9)
    assert night_row.longitude == pytest.approx(5.2)
    assert night_row.place_id == UUID(place_h)
    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "stale"


def test_place_as_departure_stales_first_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    from app.trips.models import TripDeparture

    place_d = create_place(integration_client, poi_map.id, "Départ D")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    created_departure = integration_client.post(
        f"/trips/{trip['id']}/departure", json={"place_id": place_d}
    )
    assert created_departure.status_code in {200, 201}, created_departure.text
    make_route_ready(database_session, day1)

    patch_place(integration_client, place_d, 47.3, 3.9)

    departure = database_session.scalars(select(TripDeparture)).one()
    database_session.refresh(departure)
    assert departure.latitude == pytest.approx(47.3)
    assert departure.longitude == pytest.approx(3.9)
    assert departure.place_id == UUID(place_d)
    assert day_status(database_session, day1) == "stale"


def test_place_as_arrival_stales_last_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    from app.trips.models import TripArrival

    place_a = create_place(integration_client, poi_map.id, "Arrivée A")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    created_arrival = integration_client.post(
        f"/trips/{trip['id']}/arrival", json={"place_id": place_a}
    )
    assert created_arrival.status_code in {200, 201}, created_arrival.text
    make_route_ready(database_session, day1)

    patch_place(integration_client, place_a, 44.1, 3.2)

    arrival = database_session.scalars(select(TripArrival)).one()
    database_session.refresh(arrival)
    assert arrival.latitude == pytest.approx(44.1)
    assert arrival.longitude == pytest.approx(3.2)
    assert arrival.place_id == UUID(place_a)
    assert day_status(database_session, day1) == "stale"


def test_completed_trip_keeps_frozen_snapshots_and_routes(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_x = create_place(integration_client, poi_map.id, "Figé X")
    trip = create_trip(integration_client, poi_map.id)
    day_id = trip["days"][0]["id"]
    stop = add_place_stop(integration_client, day_id, place_x)
    make_route_ready(database_session, day_id)

    archived = integration_client.post(f"/trips/{trip['id']}/archive")
    assert archived.json()["status"] == "completed"

    patch_place(integration_client, place_x, 48.8, 2.35)
    renamed = integration_client.patch(
        f"/places/{place_x}", json={"name": "Figé X renommé"}
    )
    assert renamed.status_code == 200, renamed.text

    # Structural snapshot frozen: coordinates unchanged, route untouched.
    frozen_stop = database_session.get(TripStop, UUID(stop["id"]))
    database_session.refresh(frozen_stop)
    assert frozen_stop.latitude == pytest.approx(45.0)
    assert frozen_stop.longitude == pytest.approx(4.0)
    assert day_status(database_session, day_id) == "ready"
    # The documentary name mirror keeps following the canonical place.
    assert frozen_stop.name == "Figé X renommé"


def test_add_stop_at_end_stales_next_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_new = create_place(integration_client, poi_map.id, "Ajout fin")
    place_other = create_place(integration_client, poi_map.id, "Existant")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    add_place_stop(integration_client, day1, place_other)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    add_place_stop(integration_client, day1, place_new)

    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "stale"


def test_delete_last_stop_stales_next_day(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_boundary = create_place(integration_client, poi_map.id, "Borne")
    place_early = create_place(integration_client, poi_map.id, "Tôt")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    add_place_stop(integration_client, day1, place_early)
    boundary_stop = add_place_stop(integration_client, day1, place_boundary)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    deleted = integration_client.delete(f"/trip-stops/{boundary_stop['id']}")
    assert deleted.status_code == 204

    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "stale"


def test_delete_intermediate_stop_keeps_next_day_ready(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_a = create_place(integration_client, poi_map.id, "A")
    place_mid = create_place(integration_client, poi_map.id, "Milieu")
    place_b = create_place(integration_client, poi_map.id, "B")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    add_place_stop(integration_client, day1, place_a)
    middle_stop = add_place_stop(integration_client, day1, place_mid)
    add_place_stop(integration_client, day1, place_b)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    deleted = integration_client.delete(f"/trip-stops/{middle_stop['id']}")
    assert deleted.status_code == 204

    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "ready"


def test_reorder_changing_last_stales_next_day_and_noop_is_inert(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_a = create_place(integration_client, poi_map.id, "Ra")
    place_b = create_place(integration_client, poi_map.id, "Rb")
    place_c = create_place(integration_client, poi_map.id, "Rc")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    stop_a = add_place_stop(integration_client, day1, place_a)
    stop_b = add_place_stop(integration_client, day1, place_b)
    stop_c = add_place_stop(integration_client, day1, place_c)
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    # Reorder that keeps the same last stop (C): next day stays ready.
    reordered = integration_client.post(
        f"/trip-days/{day1}/stops/reorder",
        json={"ids": [stop_b["id"], stop_a["id"], stop_c["id"]]},
    )
    assert reordered.status_code == 200, reordered.text
    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "ready"

    make_route_ready(database_session, day1)
    # No-op reorder: nothing is invalidated.
    noop = integration_client.post(
        f"/trip-days/{day1}/stops/reorder",
        json={"ids": [stop_b["id"], stop_a["id"], stop_c["id"]]},
    )
    assert noop.status_code == 200
    assert day_status(database_session, day1) == "ready"
    assert day_status(database_session, day2) == "ready"

    make_route_ready(database_session, day1)
    # Reorder moving a different stop into the last position.
    changed_last = integration_client.post(
        f"/trip-days/{day1}/stops/reorder",
        json={"ids": [stop_b["id"], stop_c["id"], stop_a["id"]]},
    )
    assert changed_last.status_code == 200
    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "stale"


def test_night_blocks_boundary_propagation(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_last = create_place(integration_client, poi_map.id, "Fin J1")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    last_stop = add_place_stop(integration_client, day1, place_last)
    hotel = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": day1,
            "next_day_id": day2,
            "name": "Nuit",
            "latitude": 45.2,
            "longitude": 4.1,
        },
    )
    assert hotel.status_code == 201
    make_route_ready(database_session, day1)
    make_route_ready(database_session, day2)

    moved = integration_client.patch(
        f"/trip-stops/{last_stop['id']}",
        json={"latitude": 45.6, "longitude": 4.6},
    )
    assert moved.status_code == 200, moved.text

    assert day_status(database_session, day1) == "stale"
    # Day 2 starts from the night snapshot, not from the last stop of day 1.
    assert day_status(database_session, day2) == "ready"


def test_move_last_stop_j1_to_j2_stales_three_days(
    integration_client: TestClient, poi_map, database_session
) -> None:
    place_moved = create_place(integration_client, poi_map.id, "Déplacé")
    trip = create_trip(integration_client, poi_map.id)
    day1 = trip["days"][0]["id"]
    day2 = add_day(integration_client, trip["id"])["id"]
    day3 = add_day(integration_client, trip["id"])["id"]
    moved_stop = add_place_stop(integration_client, day1, place_moved)
    for day_id in (day1, day2, day3):
        make_route_ready(database_session, day_id)

    moved = integration_client.post(
        f"/trip-stops/{moved_stop['id']}/move",
        json={"target_day_id": day2, "sort_order": 0},
    )
    assert moved.status_code == 200, moved.text

    assert day_status(database_session, day1) == "stale"
    assert day_status(database_session, day2) == "stale"
    # Day 3 starts where day 2 now ends (the moved stop).
    assert day_status(database_session, day3) == "stale"
