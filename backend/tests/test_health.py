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
