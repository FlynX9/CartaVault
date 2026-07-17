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
