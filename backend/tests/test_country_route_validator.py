from app.trips.routing.country_validator import CountryRouteValidator


BOUNDARIES = {
    "TST": [
        [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]],
    ],
}


def validator(**kwargs):
    return CountryRouteValidator(BOUNDARIES, tolerance_meters=kwargs.get("tolerance", 100), max_outside_distance_meters=kwargs.get("maximum", 300))


def test_accepts_complete_route_inside_country():
    result = validator().validate_route_within_country({"type": "LineString", "coordinates": [[0.1, 0.1], [0.9, 0.9]]}, "TST")
    assert result.is_valid is True
    assert result.outside_distance_meters == 0


def test_rejects_significant_outside_segment_after_densifying_geometry():
    result = validator(maximum=200).validate_route_within_country({"type": "LineString", "coordinates": [[0.1, 0.5], [1.5, 0.5], [0.9, 0.5]]}, "TST")
    assert result.is_valid is False
    assert result.reason == "route_leaves_country"
    assert result.first_exit_coordinate is not None
    assert result.outside_segment_count == 1


def test_tolerates_small_boundary_imprecision_but_not_real_crossing():
    close = validator(tolerance=150, maximum=300).validate_route_within_country({"type": "LineString", "coordinates": [[0.5, 0.5], [1.0005, 0.5]]}, "TST")
    far = validator(tolerance=150, maximum=300).validate_route_within_country({"type": "LineString", "coordinates": [[0.5, 0.5], [1.02, 0.5]]}, "TST")
    assert close.is_valid is True
    assert far.is_valid is False


def test_reports_invalid_geometry_and_unavailable_boundary():
    assert validator().validate_route_within_country({"type": "LineString", "coordinates": []}, "TST").reason == "invalid_geometry"
    assert validator().validate_route_within_country({"type": "LineString", "coordinates": [[0, 0], [1, 1]]}, "NONE").reason == "boundary_unavailable"
