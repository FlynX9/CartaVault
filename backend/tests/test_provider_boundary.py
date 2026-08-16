from datetime import UTC, datetime, timedelta
import json
from types import SimpleNamespace
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi import HTTPException
import pytest
from starlette.requests import Request

from app.auth.provider_sessions import (
    GoogleTilesSession,
    ProviderSessionError,
    decode_google_tiles_session,
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
    monkeypatch.setattr(stadia_router, "selected_api_key", lambda *_args: credential)
    monkeypatch.setattr(stadia_credential_router, "selected_api_key", lambda *_args: credential)

    maps = stadia_router.basemap_config(SimpleNamespace(), SimpleNamespace(id=uuid4()))
    places = stadia_credential_router.search_config(SimpleNamespace(), SimpleNamespace(id=uuid4()))

    assert secret not in json.dumps(maps)
    assert secret not in json.dumps(places)
    assert "api_key" not in maps and "api_key" not in places
    assert maps["tile_path"].startswith("/basemaps/stadia/tiles/")


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


def test_google_tile_session_cannot_be_reused_by_another_user(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_encryption(monkeypatch)
    owner_id = uuid4()
    credential_id = uuid4()
    token = encode_google_tiles_session(
        GoogleTilesSession(owner_id, credential_id, "provider-session", datetime.now(UTC) + timedelta(minutes=5))
    )
    attacker = SimpleNamespace(id=uuid4())
    credential = SimpleNamespace(id=credential_id)
    monkeypatch.setattr(google_tiles, "selected_api_key", lambda *_args: credential)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", f"{google_tiles.GOOGLE_TILES_SESSION_COOKIE}={token}".encode())],
    })

    with pytest.raises(HTTPException) as raised:
        google_tiles.tile(0, 0, 0, request, SimpleNamespace(), attacker)

    assert raised.value.status_code == 403
    assert raised.value.detail["code"] == "GOOGLE_MAP_TILES_SESSION_FORBIDDEN"
