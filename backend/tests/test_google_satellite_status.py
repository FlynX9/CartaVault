import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.integration


def test_google_satellite_status_returns_usage_without_server_error(
    integration_client: TestClient,
) -> None:
    response = integration_client.get("/basemaps/google-satellite/status")

    assert response.status_code == 200
    assert response.json() == {"available": False, "warning_level": 0}
