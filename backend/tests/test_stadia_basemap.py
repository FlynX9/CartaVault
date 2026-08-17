from urllib.error import HTTPError

import pytest
from fastapi import HTTPException

from app.basemaps.stadia_router import _validate_key
from app.places.stadia_credential_router import _validate_key as validate_stadia_places_key


pytestmark = pytest.mark.unit


class Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_stadia_key_verification_uses_the_standard_tile_api(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.basemaps.stadia_router.urlopen", lambda request, timeout: captured.append((request, timeout)) or Response())

    _validate_key("personal stadia key")

    request, timeout = captured[0]
    assert request.full_url == "https://tiles.stadiamaps.com/tiles/alidade_smooth/0/0/0.png?api_key=personal%20stadia%20key"
    assert request.get_header("Accept") == "image/*"
    assert timeout == 10


def test_stadia_key_verification_reports_an_invalid_credential(monkeypatch) -> None:
    def reject(request, timeout):
        raise HTTPError(request.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr("app.basemaps.stadia_router.urlopen", reject)

    with pytest.raises(HTTPException) as raised:
        _validate_key("invalid")

    assert raised.value.status_code == 422
    assert raised.value.detail["code"] == "STADIA_MAPS_KEY_INVALID"


def test_stadia_places_key_verification_uses_the_geocoding_api(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.places.stadia_credential_router.urlopen", lambda request, timeout: captured.append((request, timeout)) or Response())

    validate_stadia_places_key("personal stadia key")

    request, timeout = captured[0]
    assert request.full_url == "https://api-eu.stadiamaps.com/geocoding/v1/search?text=Paris&size=1&api_key=personal%20stadia%20key"
    assert timeout == 10
