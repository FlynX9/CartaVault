import pytest


pytestmark = pytest.mark.integration


def test_public_liveness_and_readiness_are_minimal(integration_client) -> None:
    liveness = integration_client.get("/healthz")
    readiness = integration_client.get("/health/ready")

    assert liveness.status_code == 200
    assert liveness.json() == {"status": "ok"}
    assert readiness.status_code == 200
    assert readiness.json() == {"status": "ready"}
    assert "database" not in readiness.text.lower()
    assert "version" not in readiness.text.lower()
