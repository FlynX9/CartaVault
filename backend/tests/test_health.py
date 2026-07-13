import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.unit


def test_health_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "POI Manager API is running",
    }


def test_invalid_uuid_is_rejected_without_database(
    api_client: TestClient,
) -> None:
    response = api_client.get("/tags/not-a-uuid")

    assert response.status_code == 422


def test_cors_preflight_allows_write_methods(api_client: TestClient) -> None:
    response = api_client.options(
        "/places/00000000-0000-0000-0000-000000000000",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert "DELETE" in response.headers["access-control-allow-methods"]
