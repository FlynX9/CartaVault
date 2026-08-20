from types import SimpleNamespace

import pytest

from app.basemaps import vector_router
from app.main import app


def test_online_vector_status_never_requests_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    policy = SimpleNamespace(
        enabled=True,
        min_zoom=0,
        max_zoom=14,
        offline_min_zoom=5,
        offline_max_zoom=14,
        offline_padding_km=20,
        offline_max_tiles=25_000,
    )
    session = SimpleNamespace(get=lambda *_args: None, commit=lambda: None)
    monkeypatch.setattr(vector_router, "get_vector_basemap_policy", lambda _session: policy)
    monkeypatch.setattr(vector_router, "ensure_catalog_rows", lambda _session: None)
    monkeypatch.setattr(vector_router, "maybe_prepare_for_policy", lambda *_args, **_kwargs: pytest.fail("online navigation requested PMTiles generation"))

    payload = vector_router.config("FR", "status", session, SimpleNamespace(id="user"))

    assert payload["available"] is False
    assert payload["archive_url"] is None


def test_online_basemaps_expose_sessions_or_configuration_but_no_tile_proxy() -> None:
    paths = set(app.openapi()["paths"])
    assert "/basemaps/arcgis-satellite/session" in paths
    assert "/basemaps/google-satellite/maps-js/config" in paths
    assert "/basemaps/google-satellite/maps-js/loaded" in paths
    assert not any(path.startswith("/basemaps/stadia/") for path in paths)
    assert not any(path.startswith("/basemaps/mapbox-satellite/") for path in paths)
    assert "/basemaps/google-satellite/session" not in paths
    assert not any(path.startswith("/basemaps/google-satellite/tiles/") for path in paths)
