import pytest

from app.countries.catalog import load_country_bounds


pytestmark = pytest.mark.unit


def test_country_bounds_use_west_south_east_north_order() -> None:
    bounds = load_country_bounds()

    assert bounds["FR"] == (-5.0, 42.5, 9.56, 51.15)
    assert bounds["GE"] == (39.96, 41.06, 46.64, 43.55)
    assert all(len(country_bounds) == 4 for country_bounds in bounds.values())
