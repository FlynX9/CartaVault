from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response

from app.basemaps import arcgis_router


def test_arcgis_session_returns_only_short_lived_browser_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    long_key = "long-lived-secret-key"
    short_token = "short-session-token"
    previous = arcgis_router.arcgis_basemap_settings.api_key
    object.__setattr__(arcgis_router.arcgis_basemap_settings, "api_key", long_key)
    expires = datetime.now(UTC) + timedelta(hours=1)
    calls: list[tuple[str, str]] = []

    def provider(path: str, bearer: str):
        calls.append((path, bearer))
        if path.startswith("/sessions/start"):
            return {"sessionToken": short_token, "endTime": expires.timestamp() * 1000}
        return {"baseMap": {"baseMapLayers": [{"url": "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"}]}}

    monkeypatch.setattr(arcgis_router, "_provider_json", provider)
    try:
        payload = arcgis_router.create_arcgis_session(Response(), SimpleNamespace())
    finally:
        object.__setattr__(arcgis_router.arcgis_basemap_settings, "api_key", previous)
    assert calls == [(calls[0][0], long_key), ("/webmaps/arcgis/imagery", short_token)]
    assert payload["tile_url"] == "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=short-session-token"
    assert long_key not in repr(payload)


def test_arcgis_session_requires_instance_credential() -> None:
    previous = arcgis_router.arcgis_basemap_settings.api_key
    object.__setattr__(arcgis_router.arcgis_basemap_settings, "api_key", "")
    try:
        with pytest.raises(HTTPException) as caught:
            arcgis_router.create_arcgis_session(Response(), SimpleNamespace())
        assert caught.value.status_code == 503
        assert caught.value.detail["code"] == "ARCGIS_NOT_CONFIGURED"
    finally:
        object.__setattr__(arcgis_router.arcgis_basemap_settings, "api_key", previous)
