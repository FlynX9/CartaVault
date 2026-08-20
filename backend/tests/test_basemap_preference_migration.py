import pytest

from app.auth.schemas import AccountPreferences


pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("legacy", "expected"),
    [
        ("cartavault-light", "openfreemap-light"),
        ("stadia-light", "openfreemap-light"),
        ("google-roadmap", "openfreemap-light"),
        ("osm", "openfreemap-light"),
        ("osm-standard", "openfreemap-light"),
        ("cartavault-dark", "openfreemap-dark"),
        ("stadia-dark", "openfreemap-dark"),
        ("satellite", "arcgis-satellite"),
        ("stadia-satellite", "arcgis-satellite"),
        ("mapbox-satellite", "arcgis-satellite"),
        ("google-map-tiles", "google-satellite"),
        ("google-satellite-tiles", "google-satellite"),
        ("unknown-provider", "openfreemap-light"),
    ],
)
def test_legacy_basemap_identifier_migration(legacy: str, expected: str) -> None:
    migrated = AccountPreferences.model_validate({"preferred_basemap": legacy})

    assert migrated.preferred_basemap == expected
    assert AccountPreferences.model_validate(migrated.model_dump()).model_dump() == migrated.model_dump()


def test_legacy_provider_and_google_key_fields_are_normalized() -> None:
    legacy_key = "4f87f90c-250e-47d5-af51-a78f76472b66"

    migrated = AccountPreferences.model_validate(
        {
            "preferred_basemap": "google-satellite-tiles",
            "basemaps": {
                "classic_provider": "google",
                "satellite_provider": "google",
                "satellite_api_key_id": legacy_key,
            },
        }
    )

    assert migrated.basemaps.model_dump(mode="json") == {
        "classic_provider": "openfreemap",
        "satellite_provider": "google",
        "google_maps_js_api_key_id": legacy_key,
    }
