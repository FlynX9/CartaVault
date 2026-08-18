import asyncio
from types import SimpleNamespace

import pytest
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from starlette.requests import Request

from app.basemaps import mapbox_router
from app.auth.provider_sessions import BasemapTileSession, encode_basemap_tile_session


pytestmark = pytest.mark.unit


class TileResponse:
    status = 200
    headers = SimpleNamespace(get_content_type=lambda: "image/jpeg")

    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def read(self, _limit): return b"jpeg"


def test_mapbox_validation_keeps_the_token_server_side(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr(mapbox_router, "urlopen", lambda request, timeout: captured.append(request) or TileResponse())
    mapbox_router.validate_mapbox_key("pk.test-token")
    assert "access_token=pk.test-token" in captured[0].full_url


def test_mapbox_tile_proxy_returns_provider_image(monkeypatch) -> None:
    from cryptography.fernet import Fernet
    monkeypatch.setattr("app.auth.credential_encryption.credential_settings", SimpleNamespace(encryption_key=Fernet.generate_key().decode()))
    token = encode_basemap_tile_session(BasemapTileSession(
        provider="mapbox", user_id=uuid4(), credential_id=uuid4(), api_key="pk.test-token",
        capability="satellite_basemap", expires_at=datetime.now(UTC) + timedelta(minutes=5),
    ))
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [(b"cookie", f"{mapbox_router.MAPBOX_TILE_SESSION_COOKIE}={token}".encode())]})
    monkeypatch.setattr(mapbox_router.mapbox_tiles_rate_limiter, "check", lambda _key: None)
    async def fetch_tile(url, *, headers, timeout):
        assert "access_token=pk.test-token" in url
        assert headers["Accept"] == "image/*"
        assert timeout == 10
        return b"jpeg", "image/jpeg"

    monkeypatch.setattr(mapbox_router, "fetch_basemap_tile", fetch_tile)
    response = asyncio.run(mapbox_router.tile(0, 0, 0, request))
    assert response.media_type == "image/jpeg"
    assert response.body == b"jpeg"
    assert response.headers["cache-control"] == "private, max-age=86400"
