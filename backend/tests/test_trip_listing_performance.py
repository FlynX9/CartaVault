from __future__ import annotations

from datetime import datetime
import re

import pytest
from sqlalchemy import event

from app.trips.models import (
    Trip,
    TripArrival,
    TripDay,
    TripDeparture,
    TripNight,
    TripNightPhoto,
    TripStop,
)


pytestmark = pytest.mark.integration


def test_map_trip_listing_batches_the_complete_trip_graph(
    integration_client,
    database_session,
    poi_map,
    auth_user,
) -> None:
    trip_specs = (
        ("Older active", datetime(2026, 1, 1), None),
        ("Newer active", datetime(2026, 1, 3), None),
        ("Archived", datetime(2026, 1, 4), datetime(2026, 1, 4)),
    )
    trip_ids = []

    for index, (name, updated_at, archived_at) in enumerate(trip_specs):
        trip = Trip(
            map_id=poi_map.id,
            created_by_user_id=auth_user.id,
            name=name,
            description=f"Description {index}",
            status="archived" if archived_at else "planned",
            archived_at=archived_at,
            updated_at=updated_at,
        )
        database_session.add(trip)
        database_session.flush()
        trip_ids.append(trip.id)

        first_day = TripDay(
            trip_id=trip.id,
            day_number=1,
            sort_order=0,
            title=f"Day {index}-1",
            color="#0FA68A",
        )
        second_day = TripDay(
            trip_id=trip.id,
            day_number=2,
            sort_order=1,
            title=f"Day {index}-2",
            color="#2563EB",
        )
        database_session.add_all((first_day, second_day))
        database_session.flush()

        database_session.add(TripStop(
            trip_day_id=first_day.id,
            stop_type="free_location",
            name=f"Stop {index}",
            latitude=48.0 + index,
            longitude=2.0 + index,
            sort_order=0,
        ))
        night = TripNight(
            trip_id=trip.id,
            previous_day_id=first_day.id,
            next_day_id=second_day.id,
            source_type="map",
            name=f"Night {index}",
            latitude=48.1 + index,
            longitude=2.1 + index,
        )
        database_session.add(night)
        database_session.flush()
        database_session.add_all((
            TripNightPhoto(
                night_id=night.id,
                file_path=f"test/{night.id}/photo.jpg",
                mime_type="image/jpeg",
                file_size_bytes=10,
                sort_order=0,
            ),
            TripDeparture(
                trip_id=trip.id,
                name=f"Departure {index}",
                latitude=47.9 + index,
                longitude=1.9 + index,
            ),
            TripArrival(
                trip_id=trip.id,
                name=f"Arrival {index}",
                latitude=48.2 + index,
                longitude=2.2 + index,
            ),
        ))

    deleted_trip = Trip(
        map_id=poi_map.id,
        created_by_user_id=auth_user.id,
        name="Deleted",
        deleted_at=datetime(2026, 1, 5),
        updated_at=datetime(2026, 1, 5),
    )
    database_session.add(deleted_trip)
    database_session.flush()
    database_session.expire_all()

    expected_by_id = {}
    for trip_id in trip_ids:
        response = integration_client.get(f"/trips/{trip_id}")
        assert response.status_code == 200, response.text
        expected_by_id[str(trip_id)] = response.json()
    database_session.expire_all()

    statements: list[str] = []

    def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(" ".join(statement.lower().split()))

    event.listen(database_session.bind, "before_cursor_execute", record_statement)
    try:
        listed = integration_client.get(f"/maps/{poi_map.id}/trips")
    finally:
        event.remove(database_session.bind, "before_cursor_execute", record_statement)

    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert [item["id"] for item in payload] == [str(trip_ids[1]), str(trip_ids[0]), str(trip_ids[2])]
    assert [item for item in payload] == [expected_by_id[item["id"]] for item in payload]
    assert str(deleted_trip.id) not in {item["id"] for item in payload}
    listed_by_id = {item["id"]: item for item in payload}
    for index, trip_id in enumerate(trip_ids):
        item = listed_by_id[str(trip_id)]
        assert [day["title"] for day in item["days"]] == [f"Day {index}-1", f"Day {index}-2"]
        assert item["days"][0]["stops"][0]["name"] == f"Stop {index}"
        assert item["nights"][0]["name"] == f"Night {index}"
        assert len(item["nights"][0]["photos"]) == 1
        assert item["departure"]["name"] == f"Departure {index}"
        assert item["arrival"]["name"] == f"Arrival {index}"

    graph_tables = (
        "trips",
        "trip_days",
        "trip_stops",
        "trip_nights",
        "trip_night_photos",
        "trip_departures",
        "trip_arrivals",
    )
    graph_select_counts = {
        table: sum(
            statement.startswith("select ")
            and re.search(rf"\bfrom {table}\b", statement) is not None
            for statement in statements
        )
        for table in graph_tables
    }
    assert graph_select_counts == {table: 1 for table in graph_tables}
