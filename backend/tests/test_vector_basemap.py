from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app.config import vector_basemap_settings


@pytest.fixture
def vector_archive(tmp_path: Path) -> Path:
    archive = tmp_path / "europe.pmtiles"
    archive.write_bytes(bytes(range(256)) * 8)
    previous = (vector_basemap_settings.enabled, vector_basemap_settings.archive_path, vector_basemap_settings.version)
    object.__setattr__(vector_basemap_settings, "enabled", True)
    object.__setattr__(vector_basemap_settings, "archive_path", archive)
    object.__setattr__(vector_basemap_settings, "version", "test-2026-08")
    try:
        yield archive
    finally:
        object.__setattr__(vector_basemap_settings, "enabled", previous[0])
        object.__setattr__(vector_basemap_settings, "archive_path", previous[1])
        object.__setattr__(vector_basemap_settings, "version", previous[2])


def test_vector_basemap_config_reflects_mounted_archive(api_client: TestClient, vector_archive: Path) -> None:
    response = api_client.get("/api/basemaps/cartavault/config")
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["version"] == "test-2026-08"
    assert response.json()["archive_url"] == "/basemaps/cartavault/archive.pmtiles"


def test_vector_archive_supports_http_byte_ranges(api_client: TestClient, vector_archive: Path) -> None:
    response = api_client.get("/api/basemaps/cartavault/archive.pmtiles", headers={"Range": "bytes=10-19"})
    assert response.status_code == 206
    assert response.content == vector_archive.read_bytes()[10:20]
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-range"] == f"bytes 10-19/{vector_archive.stat().st_size}"
    assert response.headers["content-length"] == "10"
    assert response.headers["content-type"].startswith("application/vnd.pmtiles")
    head = api_client.head("/api/basemaps/cartavault/archive.pmtiles")
    assert head.status_code == 200
    assert head.content == b""
    assert head.headers["content-length"] == str(vector_archive.stat().st_size)


def test_vector_archive_rejects_invalid_or_multiple_ranges(api_client: TestClient, vector_archive: Path) -> None:
    response = api_client.get("/api/basemaps/cartavault/archive.pmtiles", headers={"Range": "bytes=0-1,4-5"})
    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{vector_archive.stat().st_size}"


def test_vector_archive_is_optional_and_never_accepts_a_file_path(api_client: TestClient, vector_archive: Path) -> None:
    object.__setattr__(vector_basemap_settings, "enabled", False)
    assert api_client.get("/api/basemaps/cartavault/config").json()["available"] is False
    response = api_client.get("/api/basemaps/cartavault/archive.pmtiles", params={"path": str(vector_archive.parent / "secret")})
    assert response.status_code == 404
