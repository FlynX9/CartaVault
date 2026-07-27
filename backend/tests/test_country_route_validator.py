from app.trips.routing.country_validator import CountryRouteValidator, load_boundaries
from app.countries.catalog import load_country_bounds, load_country_catalog


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


def test_embedded_boundaries_cover_france_and_validate_a_route_inside_it():
    boundaries = load_boundaries()
    assert "FRA" in boundaries
    primary_country_codes = set(load_country_bounds())
    expected_codes = {country["iso_alpha3"] for country in load_country_catalog() if country["iso_alpha2"] in primary_country_codes}
    assert expected_codes <= boundaries.keys()
    result = CountryRouteValidator().validate_route_within_country(
        {"type": "LineString", "coordinates": [[2.30, 48.84], [2.36, 48.87]]},
        "FRA",
    )
    assert result.is_valid is True


def test_embedded_boundaries_reject_a_route_confirmed_inside_a_neighbouring_country():
    result = CountryRouteValidator().validate_route_within_country(
        {"type": "LineString", "coordinates": [[44.80, 41.70], [45.50, 40.20]]},
        "GEO",
    )
    assert result.is_valid is False
    assert result.reason == "route_leaves_country"


def test_embedded_georgia_border_tolerance_accepts_the_gogadzeebi_road_corridor():
    # The compact Natural Earth 1:110m outline places this Georgian road up
    # to 900 m on the Turkish side.  It must not invalidate an in-country
    # route merely because of the bundled boundary precision.
    result = CountryRouteValidator().validate_route_within_country(
        {
            "type": "LineString",
            "coordinates": [[42.155172, 41.554375], [42.154970, 41.554300], [42.155110, 41.559880]],
        },
        "GEO",
    )
    assert result.is_valid is True
