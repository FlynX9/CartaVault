import asyncio
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from fastapi import HTTPException

from app.basemaps import stadia_router
from app.basemaps.stadia_router import _validate_key
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


def test_stadia_tile_releases_database_before_waiting_for_provider(monkeypatch) -> None:
    events: list[str] = []
    credential = SimpleNamespace(id="key")
    session = SimpleNamespace(close=lambda: events.append("database-closed"))
    monkeypatch.setattr(stadia_router, "selected_basemap_api_key", lambda *_args: credential)
    monkeypatch.setattr(stadia_router, "_decrypt", lambda _credential: "stadia key")
    monkeypatch.setattr(stadia_router.stadia_tiles_rate_limiter, "check", lambda _key: None)

    async def fetch_tile(url, *, headers, timeout):
        events.append("provider-started")
        assert "api_key=stadia%20key" in url
        assert headers["Accept"] == "image/*"
        assert timeout == 10
        return b"png", "image/png"

    monkeypatch.setattr(stadia_router, "fetch_basemap_tile", fetch_tile)
    response = asyncio.run(stadia_router.basemap_tile(
        "alidade_smooth", 0, 0, 0, "png", "", session, SimpleNamespace(id="user")
    ))

    assert events == ["database-closed", "provider-started"]
    assert response.body == b"png"
    assert response.headers["cache-control"] == "private, max-age=86400"


def test_slow_stadia_tiles_do_not_block_liveness(monkeypatch) -> None:
    started = 0
    all_started = asyncio.Event()
    release_provider = asyncio.Event()
    closed_sessions: list[int] = []
    credential = SimpleNamespace(id="key")
    monkeypatch.setattr(stadia_router, "selected_basemap_api_key", lambda *_args: credential)
    monkeypatch.setattr(stadia_router, "_decrypt", lambda _credential: "stadia key")
    monkeypatch.setattr(stadia_router.stadia_tiles_rate_limiter, "check", lambda _key: None)

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
            "alidade_smooth", 6, index % 64, index // 64, "png", "",
            SimpleNamespace(close=lambda index=index: closed_sessions.append(index)),
            SimpleNamespace(id="user"),
        )) for index in range(48)]
        await asyncio.wait_for(all_started.wait(), timeout=1)
        assert await asyncio.wait_for(healthz(), timeout=0.1) == {"status": "ok"}
        release_provider.set()
        await asyncio.gather(*tasks)

    asyncio.run(scenario())
    assert len(closed_sessions) == 48
