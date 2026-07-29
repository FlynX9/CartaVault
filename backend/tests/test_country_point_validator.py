from app.countries.point_validator import validate_point_country


def test_point_country_validation_handles_inside_tolerance_and_outside(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.countries.point_validator.load_boundaries",
        lambda: {"TST": [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]]},
    )

    assert validate_point_country(0.5, 0.5, "tst", tolerance_meters=150).status == "inside"
    assert validate_point_country(0.5, 1.0005, "TST", tolerance_meters=150).status == "border_tolerance"
    outside = validate_point_country(0.5, 1.02, "TST", tolerance_meters=150)
    assert outside.status == "outside"
    assert outside.requires_confirmation is True


def test_point_country_validation_accepts_secondary_territory_polygon(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.countries.point_validator.load_boundaries",
        lambda: {
            "TST": [
                [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
            ]
        },
    )

    assert validate_point_country(10.5, 10.5, "TST").status == "inside"


def test_point_country_validation_is_non_blocking_when_boundary_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr("app.countries.point_validator.load_boundaries", lambda: {})

    result = validate_point_country(48, 2, "NONE")

    assert result.status == "boundary_unavailable"
    assert result.requires_confirmation is False
