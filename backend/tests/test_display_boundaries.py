from app.countries.display_boundary import load_display_boundaries
from app.trips.routing.country_validator import load_boundaries


def _point_count(polygons) -> int:
    return sum(len(ring) for polygon in polygons for ring in polygon)


def test_display_boundaries_are_detailed_but_bounded() -> None:
    routing = load_boundaries()
    low = load_display_boundaries("low")
    medium = load_display_boundaries("medium")
    high = load_display_boundaries("high")

    assert low.keys() == medium.keys() == high.keys()
    assert len(low) >= 230
    assert _point_count(routing["GEO"]) < _point_count(low["GEO"])
    assert _point_count(low["GEO"]) < _point_count(medium["GEO"])
    assert _point_count(medium["GEO"]) < _point_count(high["GEO"])
    for display, maximum in ((low, 3_000), (medium, 12_000), (high, 30_000)):
        assert max(_point_count(polygons) for polygons in display.values()) <= maximum
        assert all(
            ring[0][:2] == ring[-1][:2]
            for polygons in display.values()
            for polygon in polygons
            for ring in polygon
        )
