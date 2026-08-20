import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

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
