from datetime import UTC, datetime, timedelta
import asyncio
import json
import threading
import time
from types import SimpleNamespace
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi import HTTPException, Response
import pytest
from starlette.requests import Request

from app.auth.provider_sessions import (
    BasemapTileSession,
    GoogleTilesSession,
    ProviderSessionError,
    decode_basemap_tile_session,
    decode_google_tiles_session,
    encode_basemap_tile_session,
    encode_google_tiles_session,
)
from app.basemaps import router as google_tiles
from app.basemaps import stadia_router
from app.places import stadia_credential_router


pytestmark = pytest.mark.unit


class JsonResponse:
    status = 200

    def __init__(self, payload: dict[str, object]):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit: int) -> bytes:
        return json.dumps(self.payload).encode()


def _configure_encryption(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.auth.credential_encryption.credential_settings",
        SimpleNamespace(encryption_key=Fernet.generate_key().decode()),
    )


def test_provider_configuration_never_returns_a_persistent_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "persistent-provider-secret"
    credential = SimpleNamespace(id=uuid4(), encrypted_secret=secret)
    monkeypatch.setattr(stadia_router, "selected_basemap_api_key", lambda *_args: credential)
    monkeypatch.setattr(stadia_router, "_decrypt", lambda *_args: secret)
    monkeypatch.setattr(stadia_credential_router, "selected_api_key", lambda *_args: credential)
    _configure_encryption(monkeypatch)

    maps = stadia_router.basemap_config(Response(), "classic_basemap", SimpleNamespace(), SimpleNamespace(id=uuid4()))
    places = stadia_credential_router.search_config(SimpleNamespace(), SimpleNamespace(id=uuid4()))

    assert secret not in json.dumps(maps)
    assert secret not in json.dumps(places)
    assert "api_key" not in maps and "api_key" not in places
    assert maps["tile_path"].startswith("/basemaps/stadia/tiles/")


def test_stadia_uses_direct_keyless_tiles_only_for_local_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(stadia_router, "selected_basemap_api_key", lambda *_args: None)
    monkeypatch.setattr(stadia_router, "email_settings", SimpleNamespace(frontend_public_url="http://localhost:5173"))
    monkeypatch.setenv("CARTAVAULT_ENVIRONMENT", "development")
    local = stadia_router.basemap_config(Response(), "classic_basemap", SimpleNamespace(), SimpleNamespace(id=uuid4()))
    assert local["key_optional"] is True
    assert local["tile_path"].startswith("https://tiles.stadiamaps.com/")

    monkeypatch.setenv("CARTAVAULT_ENVIRONMENT", "production")
    production = stadia_router.basemap_config(Response(), "classic_basemap", SimpleNamespace(), SimpleNamespace(id=uuid4()))
    assert production["key_optional"] is False
    assert production["tile_path"].startswith("/basemaps/stadia/tiles/")


def test_stadia_places_proxy_injects_secret_only_in_server_request(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "persistent-stadia-secret"
    credential = SimpleNamespace(id=uuid4())
    captured_urls: list[str] = []
    monkeypatch.setattr(stadia_credential_router, "selected_api_key", lambda *_args: credential)
    monkeypatch.setattr(stadia_credential_router, "_decrypt", lambda _credential: secret)
    monkeypatch.setattr(stadia_credential_router.stadia_places_rate_limiter, "check", lambda _key: None)
    monkeypatch.setattr(stadia_credential_router, "mark_api_key_used", lambda *_args: None)
    monkeypatch.setattr(
        stadia_credential_router,
        "urlopen",
        lambda request, timeout: captured_urls.append(request.full_url) or JsonResponse({"features": []}),
    )

    payload = stadia_credential_router._proxy(
        "search",
        {"text": "Paris", "size": 6},
        SimpleNamespace(),
        SimpleNamespace(id=uuid4()),
    )

    assert secret in captured_urls[0]
    assert secret not in json.dumps(payload)


def test_google_tile_session_is_opaque_scoped_and_expires(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_encryption(monkeypatch)
    user_id = uuid4()
    credential_id = uuid4()
    token = encode_google_tiles_session(
        GoogleTilesSession(user_id, credential_id, "provider-session-secret", datetime.now(UTC) + timedelta(minutes=5))
    )

    assert "provider-session-secret" not in token
    decoded = decode_google_tiles_session(token)
    assert decoded.user_id == user_id and decoded.credential_id == credential_id

    expired = encode_google_tiles_session(
        GoogleTilesSession(user_id, credential_id, "expired", datetime.now(UTC) - timedelta(seconds=1))
    )
    with pytest.raises(ProviderSessionError):
        decode_google_tiles_session(expired)


def test_basemap_tile_session_encrypts_provider_key_and_enforces_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_encryption(monkeypatch)
    session = BasemapTileSession(
        provider="stadia",
        user_id=uuid4(),
        credential_id=uuid4(),
        api_key="persistent-provider-secret",
        capability="classic_basemap",
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )

    token = encode_basemap_tile_session(session)

    assert session.api_key not in token
    assert decode_basemap_tile_session(token, provider="stadia") == session
    with pytest.raises(ProviderSessionError):
        decode_basemap_tile_session(token, provider="mapbox")


def test_google_tile_session_cannot_be_reused_by_another_user(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_encryption(monkeypatch)
    owner_id = uuid4()
    credential_id = uuid4()
    token = encode_google_tiles_session(
        GoogleTilesSession(owner_id, credential_id, "provider-session", datetime.now(UTC) + timedelta(minutes=5))
    )
    async def reject_attacker(*_args):
        raise HTTPException(403, {"code": "GOOGLE_MAP_TILES_SESSION_FORBIDDEN"})
    monkeypatch.setattr(google_tiles, "_run_google_tile_database", reject_attacker)
    monkeypatch.setattr(google_tiles.google_tiles_rate_limiter, "check", lambda *_args: None)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", f"{google_tiles.GOOGLE_TILES_SESSION_COOKIE}={token}; cartavault_session=attacker".encode())],
    })

    with pytest.raises(HTTPException) as raised:
        import asyncio
        asyncio.run(google_tiles.tile(0, 0, 0, request))

    assert raised.value.status_code == 403
    assert raised.value.detail["code"] == "GOOGLE_MAP_TILES_SESSION_FORBIDDEN"


def test_google_tile_database_work_is_bounded_below_pool_capacity(monkeypatch: pytest.MonkeyPatch) -> None:
    active = maximum = 0
    guard = threading.Lock()

    def database_work(value: int) -> int:
        nonlocal active, maximum
        with guard:
            active += 1
            maximum = max(maximum, active)
        time.sleep(0.02)
        with guard:
            active -= 1
        return value

    async def scenario() -> list[int]:
        monkeypatch.setattr(google_tiles, "google_tile_database_slots", asyncio.Semaphore(2))
        return await asyncio.gather(*(
            google_tiles._run_google_tile_database(database_work, value)
            for value in range(24)
        ))

    assert asyncio.run(scenario()) == list(range(24))
    assert maximum == 2
