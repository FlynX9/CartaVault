import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security_headers import (
    DOCUMENTATION_CONTENT_SECURITY_POLICY,
    SECURITY_HEADERS,
    SecurityHeadersMiddleware,
)


pytestmark = pytest.mark.unit


def build_client(base_url: str) -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/")
    def index() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/docs")
    def docs() -> str:
        return "docs"

    @app.get("/api/docs")
    def prefixed_docs() -> str:
        return "docs"

    return TestClient(app, base_url=base_url)


def test_security_headers_are_added_to_http_responses() -> None:
    response = build_client("http://testserver").get("/")

    assert response.status_code == 200
    for name, value in SECURITY_HEADERS.items():
        assert response.headers[name] == value
    assert "strict-transport-security" not in response.headers


def test_hsts_is_only_added_to_https_responses() -> None:
    response = build_client("https://testserver").get("/")

    assert response.headers["strict-transport-security"] == "max-age=31536000"


@pytest.mark.parametrize("path, expected_status", [("/docs", 200), ("/docs/", 200), ("/docs/fr/", 404), ("/pagefind/pagefind.js", 404), ("/api/docs", 200)])
def test_documentation_pages_allow_fastapi_viewer_assets(path: str, expected_status: int) -> None:
    response = build_client("http://testserver").get(path)

    assert response.status_code == expected_status
    assert response.headers["content-security-policy"] == DOCUMENTATION_CONTENT_SECURITY_POLICY
    assert "https://cdn.jsdelivr.net" in response.headers["content-security-policy"]
    assert "script-src 'self' 'unsafe-inline'" in response.headers["content-security-policy"]
    assert "'unsafe-eval'" in response.headers["content-security-policy"]
    assert "'wasm-unsafe-eval'" in response.headers["content-security-policy"]
