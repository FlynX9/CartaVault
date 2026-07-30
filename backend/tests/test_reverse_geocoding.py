from __future__ import annotations

from datetime import UTC, datetime
from urllib.error import HTTPError
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.cli import refresh_missing_regions
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.places.models import Place
from app.places.reverse_geocoding import (
    NominatimReverseGeocoder,
    ReverseGeocodingError,
    ReverseGeocodingResult,
    get_reverse_geocoder,
    normalize_nominatim_response,
)


@pytest.mark.parametrize(
    ("address", "expected_name", "expected_type", "expected_level"),
    [
        ({"state": "Grand Est"}, "Grand Est", "state", 4),
        ({"region": "Bayern"}, "Bayern", "region", 4),
        ({"province": "Québec"}, "Québec", "province", 4),
        ({"county": "Fallback County"}, "Fallback County", "county", 6),
    ],
)
def test_nominatim_region_normalization(
    address: dict[str, str],
    expected_name: str,
    expected_type: str,
    expected_level: int,
) -> None:
    result = normalize_nominatim_response(
        {
            "address": {
                "country": "France",
                "country_code": "fr",
                **address,
                f"ISO3166-2-lvl{expected_level}": "FR-GES",
            }
        }
    )
    assert result.country == "France"
    assert result.country_code == "FR"
    assert result.region_name == expected_name
    assert result.region_type == expected_type
    assert result.region_code == "FR-GES"
    assert result.admin_level == expected_level


def test_nominatim_region_normalization_accepts_missing_region() -> None:
    result = normalize_nominatim_response(
        {"address": {"country": "Georgia", "country_code": "ge", "city": "Tbilissi"}}
    )
    assert result.country == "Georgia"
    assert result.country_code == "GE"
    assert result.region_name is None
    assert result.region_type is None
    assert result.admin_level is None


class RecordingGeocoder:
    def __init__(self, region: str = "Île-de-France"):
        self.region = region
        self.calls: list[tuple[float, float]] = []

    def reverse(self, latitude: float, longitude: float) -> ReverseGeocodingResult:
        self.calls.append((latitude, longitude))
        return ReverseGeocodingResult(
            country="France",
            country_code="FR",
            region_name=self.region,
            region_type="state",
            region_code="FR-IDF",
            admin_level=4,
            source="nominatim",
            resolved_at=datetime.now(UTC).replace(tzinfo=None),
        )


class FailingGeocoder:
    def reverse(self, latitude: float, longitude: float) -> ReverseGeocodingResult:
        del latitude, longitude
        raise ReverseGeocodingError("timeout", "REVERSE_GEOCODING_TIMEOUT")


def create_place(client: TestClient, poi_map: PoiMap, **overrides: object) -> dict:
    payload: dict[str, object] = {
        "name": f"Resolved place {uuid4().hex}",
        "map_id": str(poi_map.id),
        "latitude": 48.8566,
        "longitude": 2.3522,
    }
    payload.update(overrides)
    response = client.post("/places", json=payload)
    assert response.status_code == 201
    return response.json()


def test_create_and_coordinate_update_resolve_region_without_redundant_call(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    geocoder = RecordingGeocoder()
    app.dependency_overrides[get_reverse_geocoder] = lambda: geocoder
    place = create_place(integration_client, poi_map)
    assert place["country"] == "France"
    assert place["country_code"] == "FR"
    assert place["region"] == "Île-de-France"
    assert place["region_manually_overridden"] is False
    assert len(geocoder.calls) == 1

    unchanged = integration_client.patch(
        f"/places/{place['id']}",
        json={"name": "Name only"},
    )
    assert unchanged.status_code == 200
    assert len(geocoder.calls) == 1

    moved = integration_client.patch(
        f"/places/{place['id']}",
        json={"latitude": 48.85, "longitude": 2.35},
    )
    assert moved.status_code == 200
    assert len(geocoder.calls) == 2


def test_manual_region_survives_coordinate_update_and_explicit_refresh_replaces_it(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    geocoder = RecordingGeocoder("Grand Est")
    app.dependency_overrides[get_reverse_geocoder] = lambda: geocoder
    place = create_place(integration_client, poi_map, region="Correction locale")
    assert place["region_manually_overridden"] is True
    assert geocoder.calls == []

    moved = integration_client.patch(
        f"/places/{place['id']}",
        json={"latitude": 48.8, "longitude": 2.3},
    )
    assert moved.status_code == 200
    assert moved.json()["region"] == "Correction locale"
    assert geocoder.calls == []

    refreshed = integration_client.post(f"/places/{place['id']}/refresh-region")
    assert refreshed.status_code == 200
    assert refreshed.json()["region"] == "Grand Est"
    assert refreshed.json()["region_manually_overridden"] is False
    assert len(geocoder.calls) == 1


def test_provider_failure_never_blocks_place_creation(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    app.dependency_overrides[get_reverse_geocoder] = FailingGeocoder
    place = create_place(integration_client, poi_map)
    assert place["region"] is None

    unavailable = integration_client.post(f"/places/{place['id']}/refresh-region")
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"]["code"] == "REVERSE_GEOCODING_TIMEOUT"


def test_region_refresh_requires_editor_permission(
    integration_client: TestClient,
    poi_map: PoiMap,
    database_session,
) -> None:
    place = create_place(integration_client, poi_map, region="Manual")
    viewer = User(
        email=f"region-viewer-{uuid4()}@example.test",
        display_name="Region viewer",
        password_hash="x",
        is_active=True,
        is_admin=False,
    )
    database_session.add(viewer)
    database_session.flush()
    database_session.add(
        MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer")
    )
    database_session.commit()
    app.dependency_overrides[get_current_user] = lambda: viewer
    response = integration_client.post(f"/places/{place['id']}/refresh-region")
    assert response.status_code == 403


def test_nominatim_timeout_and_http_error_are_normalized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = NominatimReverseGeocoder()
    monkeypatch.setattr(provider, "_wait_for_rate_limit", lambda: None)
    monkeypatch.setattr(
        "app.places.reverse_geocoding.urlopen",
        lambda request, timeout: (_ for _ in ()).throw(TimeoutError()),
    )
    with pytest.raises(ReverseGeocodingError) as timeout:
        provider.reverse(48.0, 2.0)
    assert timeout.value.code == "REVERSE_GEOCODING_TIMEOUT"

    monkeypatch.setattr(
        "app.places.reverse_geocoding.urlopen",
        lambda request, timeout: (_ for _ in ()).throw(
            HTTPError(request.full_url, 429, "Too Many Requests", {}, None)
        ),
    )
    with pytest.raises(ReverseGeocodingError) as http_error:
        provider.reverse(48.0, 2.0)
    assert http_error.value.code == "REVERSE_GEOCODING_HTTP_ERROR"


def test_refresh_regions_cli_is_bounded_and_rerunnable(
    database_session: Session,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    status = next(item for item in poi_map.statuses if item.is_default)
    places = [
        Place(
            name=f"CLI region {index}",
            map_id=poi_map.id,
            status_id=status.id,
            location=WKTElement(f"POINT(2.{index} 48.{index})", srid=4326),
        )
        for index in range(2)
    ]
    database_session.add_all(places)
    database_session.commit()
    geocoder = RecordingGeocoder("Normandie")

    def test_session_factory() -> Session:
        return Session(
            bind=database_session.get_bind(),
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )

    monkeypatch.setattr("app.cli.SessionLocal", test_session_factory)
    monkeypatch.setattr("app.cli.get_reverse_geocoder", lambda: geocoder)
    assert refresh_missing_regions(1) == 0
    assert len(geocoder.calls) == 1
    assert refresh_missing_regions(10) == 0
    assert len(geocoder.calls) == 2
    assert refresh_missing_regions(10) == 0
    assert len(geocoder.calls) == 2
