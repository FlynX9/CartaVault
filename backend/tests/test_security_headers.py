import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security_headers import SECURITY_HEADERS, SecurityHeadersMiddleware


pytestmark = pytest.mark.unit


def build_client(base_url: str) -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/")
    def index() -> dict[str, bool]:
        return {"ok": True}

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
