import pytest
from pydantic import ValidationError

from app.trips.schemas import TripDayTimingUpdate, TripLoadSettings


pytestmark = pytest.mark.unit


@pytest.mark.parametrize(("margin_type", "value"), [("fixed", 0), ("fixed", 720), ("percentage", 0), ("percentage", 100)])
def test_trip_day_timing_accepts_margin_boundaries(margin_type, value) -> None:
    data = TripDayTimingUpdate(default_stop_buffer_minutes=30, safety_margin_type=margin_type, safety_margin_value=value)
    assert data.safety_margin_value == value


@pytest.mark.parametrize(("margin_type", "value"), [("fixed", -1), ("fixed", 721), ("percentage", -1), ("percentage", 101)])
def test_trip_day_timing_rejects_invalid_margins(margin_type, value) -> None:
    with pytest.raises(ValidationError):
        TripDayTimingUpdate(default_stop_buffer_minutes=0, safety_margin_type=margin_type, safety_margin_value=value)


def test_trip_load_settings_validate_thresholds_and_colors() -> None:
    valid = TripLoadSettings(low_load_max_minutes=240, medium_load_max_minutes=480, low_load_color="#0FA68A", medium_load_color="#D97706", high_load_color="#DC2626")
    assert valid.medium_load_max_minutes == 480
    with pytest.raises(ValidationError):
        TripLoadSettings(low_load_max_minutes=480, medium_load_max_minutes=480, low_load_color="#0FA68A", medium_load_color="#D97706", high_load_color="#DC2626")
    with pytest.raises(ValidationError):
        TripLoadSettings(low_load_max_minutes=240, medium_load_max_minutes=480, low_load_color="green", medium_load_color="#D97706", high_load_color="#DC2626")
