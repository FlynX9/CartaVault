from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.trips.service import day_coordinates


pytestmark = pytest.mark.unit


def test_last_day_route_returns_to_departure_when_no_arrival_is_configured() -> None:
    departure = SimpleNamespace(id=uuid4(), latitude=48.0, longitude=2.0)
    stop = SimpleNamespace(id=uuid4(), latitude=49.0, longitude=3.0, sort_order=0)
    day = SimpleNamespace(day_number=1, previous_night=None, next_night=None, stops=[stop])
    day.trip = SimpleNamespace(days=[day], departure=departure, arrival=None)

    coordinates, labels = day_coordinates(day)

    assert coordinates == [(2.0, 48.0), (3.0, 49.0), (2.0, 48.0)]
    assert labels == [f"departure:{departure.id}", f"stop:{stop.id}", f"arrival:{departure.id}"]


def test_day_without_a_night_starts_at_the_previous_days_last_stop() -> None:
    previous_stop = SimpleNamespace(id=uuid4(), latitude=48.0, longitude=2.0, sort_order=0)
    current_stop = SimpleNamespace(id=uuid4(), latitude=49.0, longitude=3.0, sort_order=0)
    first_day = SimpleNamespace(day_number=1, sort_order=0, previous_night=None, next_night=None, stops=[previous_stop])
    second_day = SimpleNamespace(day_number=2, sort_order=1, previous_night=None, next_night=None, stops=[current_stop])
    trip = SimpleNamespace(days=[first_day, second_day], departure=None, arrival=None)
    first_day.trip = trip
    second_day.trip = trip

    coordinates, labels = day_coordinates(second_day)

    assert coordinates == [(2.0, 48.0), (3.0, 49.0)]
    assert labels == [f"previous-stop:{previous_stop.id}", f"stop:{current_stop.id}"]
