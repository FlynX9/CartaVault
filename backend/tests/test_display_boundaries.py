from app.countries.display_boundary import load_display_boundaries
from app.trips.routing.country_validator import load_boundaries


def _point_count(polygons) -> int:
    return sum(len(ring) for polygon in polygons for ring in polygon)


def test_display_boundaries_are_detailed_but_bounded() -> None:
    display = load_display_boundaries()
    routing = load_boundaries()

    assert _point_count(display["GEO"]) >= 450
    assert max(_point_count(polygons) for polygons in display.values()) <= 15_000
    assert all(
        ring[0][:2] == ring[-1][:2]
        for polygons in display.values()
        for polygon in polygons
        for ring in polygon
    )
