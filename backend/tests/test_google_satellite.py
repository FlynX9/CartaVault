import json

import pytest

from app.basemaps.router import DEFAULTS, _create_google_session, _usage_percent, _warning_level


pytestmark = pytest.mark.unit


class Response:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def read(self, _limit): return json.dumps({"session": "short-lived-token", "expiry": "2026-08-06T12:00:00Z"}).encode()


def test_google_satellite_session_uses_official_api_without_key_in_body(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.basemaps.router.urlopen", lambda request, timeout: captured.append((request, timeout)) or Response())
    payload = _create_google_session("browser-restricted-key")
    request, _timeout = captured[0]
    assert request.full_url.startswith("https://tile.googleapis.com/v1/createSession?key=")
    assert "browser-restricted-key" not in request.data.decode()
    assert json.loads(request.data)["mapType"] == "satellite"
    assert json.loads(request.data)["language"] == "fr-FR"
    assert "region" not in json.loads(request.data)
    assert payload["session"] == "short-lived-token"


def test_google_satellite_session_uses_account_language(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.basemaps.router.urlopen", lambda request, timeout: captured.append(request) or Response())
    _create_google_session("browser-restricted-key", "en")
    assert json.loads(captured[0].data)["language"] == "en-US"


@pytest.mark.parametrize(("tiles", "expected"), [(4_999, 0), (5_000, 50), (8_000, 80), (9_500, 95)])
def test_local_usage_warning_levels_are_deterministic(tiles: int, expected: int) -> None:
    values = {**DEFAULTS, "daily_soft_limit": 10_000, "monthly_soft_limit": 100_000}
    usage = {"tiles_started_today": tiles, "tiles_started_month": tiles}
    assert _warning_level(values, usage) == expected
    assert _usage_percent(values, usage) == tiles / 100
