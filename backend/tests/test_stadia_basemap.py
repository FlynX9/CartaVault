import asyncio
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.basemaps import stadia_router
from app.basemaps.stadia_router import _validate_key
from app.auth.provider_sessions import BasemapTileSession, encode_basemap_tile_session
from app.main import healthz
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


def _tile_request(monkeypatch, *, capability: str = "classic_basemap") -> Request:
    from cryptography.fernet import Fernet

    monkeypatch.setattr(
        "app.auth.credential_encryption.credential_settings",
        SimpleNamespace(encryption_key=Fernet.generate_key().decode()),
    )
    token = encode_basemap_tile_session(BasemapTileSession(
        provider="stadia",
        user_id=uuid4(),
        credential_id=uuid4(),
        api_key="stadia key",
        capability=capability,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    ))
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", f"{stadia_router.STADIA_TILE_SESSION_COOKIE}={token}".encode())],
    })


def test_stadia_tile_does_not_checkout_database_while_waiting_for_provider(monkeypatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(stadia_router.stadia_tiles_rate_limiter, "check", lambda _key: None)

    async def fetch_tile(url, *, headers, timeout):
        events.append("provider-started")
        assert "api_key=stadia%20key" in url
        assert headers["Accept"] == "image/*"
        assert timeout == 10
        return b"png", "image/png"

    monkeypatch.setattr(stadia_router, "fetch_basemap_tile", fetch_tile)
    response = asyncio.run(stadia_router.basemap_tile(
        "alidade_smooth", 0, 0, 0, "png", _tile_request(monkeypatch), ""
    ))

    assert events == ["provider-started"]
    assert response.body == b"png"
    assert response.headers["cache-control"] == "private, max-age=86400"


def test_slow_stadia_tiles_do_not_block_liveness(monkeypatch) -> None:
    started = 0
    all_started = asyncio.Event()
    release_provider = asyncio.Event()
    monkeypatch.setattr(stadia_router.stadia_tiles_rate_limiter, "check", lambda _key: None)
    request = _tile_request(monkeypatch)

    async def slow_fetch(*_args, **_kwargs):
        nonlocal started
        started += 1
        if started == 48:
            all_started.set()
        await release_provider.wait()
        return b"png", "image/png"

    monkeypatch.setattr(stadia_router, "fetch_basemap_tile", slow_fetch)

    async def scenario() -> None:
        tasks = [asyncio.create_task(stadia_router.basemap_tile(
            "alidade_smooth", 6, index % 64, index // 64, "png", request, "",
        )) for index in range(48)]
        await asyncio.wait_for(all_started.wait(), timeout=1)
        assert await asyncio.wait_for(healthz(), timeout=0.1) == {"status": "ok"}
        release_provider.set()
        await asyncio.gather(*tasks)

    asyncio.run(scenario())
