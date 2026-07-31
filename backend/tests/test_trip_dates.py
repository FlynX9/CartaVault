from datetime import date
from types import SimpleNamespace

from app.trips.service import synchronize_trip_dates


def test_synchronize_trip_dates_derives_arrival_and_each_day() -> None:
    days = [
        SimpleNamespace(sort_order=2, date=None),
        SimpleNamespace(sort_order=0, date=None),
        SimpleNamespace(sort_order=1, date=None),
    ]
    trip = SimpleNamespace(start_date=date(2026, 8, 10), end_date=None, days=days)

    synchronize_trip_dates(trip)

    assert trip.end_date == date(2026, 8, 12)
    assert [day.date for day in sorted(days, key=lambda item: item.sort_order)] == [
        date(2026, 8, 10),
        date(2026, 8, 11),
        date(2026, 8, 12),
    ]


def test_synchronize_trip_dates_clears_derived_dates_without_departure() -> None:
    days = [SimpleNamespace(sort_order=0, date=date(2026, 8, 10))]
    trip = SimpleNamespace(start_date=None, end_date=date(2026, 8, 10), days=days)

    synchronize_trip_dates(trip)

    assert trip.end_date is None
    assert days[0].date is None
