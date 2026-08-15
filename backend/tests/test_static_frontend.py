from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.static_frontend import install_frontend, normalize_api_prefix


@pytest.mark.unit
def test_api_prefix_is_normalized() -> None:
    assert normalize_api_prefix(None) == ""
    assert normalize_api_prefix("") == ""
    assert normalize_api_prefix("api") == "/api"
    assert normalize_api_prefix("/api/") == "/api"


@pytest.mark.unit
def test_compiled_frontend_serves_assets_and_deep_links_without_intercepting_api(
    tmp_path: Path,
) -> None:
    frontend = tmp_path / "frontend"
    assets = frontend / "assets"
    assets.mkdir(parents=True)
    (frontend / "index.html").write_text("<html>CartaVault shell</html>", encoding="utf-8")
    (frontend / "manifest.webmanifest").write_text("{}", encoding="utf-8")
    docs_page = frontend / "docs" / "fr" / "account" / "security"
    docs_page.mkdir(parents=True)
    (docs_page / "index.html").write_text("<html>Documentation sécurité</html>", encoding="utf-8")
    (assets / "index-abc123.js").write_text("console.log('ok')", encoding="utf-8")

    app = FastAPI()

    @app.get("/api/status")
    def api_status() -> dict[str, str]:
        return {"status": "api"}

    install_frontend(app, directory=frontend, api_prefix="/api")
    client = TestClient(app)

    api_response = client.get("/api/status")
    assert api_response.status_code == 200
    assert api_response.json() == {"status": "api"}

    missing_api_response = client.get("/api/missing")
    assert missing_api_response.status_code == 404
    assert missing_api_response.headers["content-type"].startswith("application/json")

    deep_link_response = client.get("/maps/example/trips/one")
    assert deep_link_response.status_code == 200
    assert "CartaVault shell" in deep_link_response.text
    assert deep_link_response.headers["cache-control"] == "no-cache, no-store, must-revalidate"

    asset_response = client.get("/assets/index-abc123.js")
    assert asset_response.status_code == 200
    assert asset_response.headers["cache-control"] == "public, max-age=31536000, immutable"

    manifest_response = client.get("/manifest.webmanifest")
    assert manifest_response.status_code == 200
    assert manifest_response.headers["cache-control"] == "public, max-age=3600"

    docs_response = client.get("/docs/fr/account/security/")
    assert docs_response.status_code == 200
    assert "Documentation sécurité" in docs_response.text
    assert "CartaVault shell" not in docs_response.text


@pytest.mark.unit
def test_frontend_installation_fails_when_build_is_missing(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="Compiled CartaVault frontend is missing"):
        install_frontend(FastAPI(), directory=tmp_path, api_prefix="/api")
