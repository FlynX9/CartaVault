from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.admin.models import SystemSetting
from app.database import get_db
from app.main import app
from app.setup_cli import generate_secrets


@pytest.fixture
def setup_client(
    database_session: Session,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[TestClient, None, None]:
    del photo_storage
    monkeypatch.setenv("CARTAVAULT_SETUP_TOKEN", "one-time-test-setup-token")
    monkeypatch.setenv("CARTAVAULT_PUBLIC_URL", "https://cartavault.example.test")
    monkeypatch.setenv("CARTAVAULT_SESSION_SECRET", "test-session-secret")
    database_session.execute(delete(User))
    database_session.execute(delete(SystemSetting))
    database_session.flush()

    def override_get_db() -> Generator[Session, None, None]:
        yield database_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.integration
def test_initial_setup_is_token_protected_and_locks_after_first_admin(
    setup_client: TestClient,
    database_session: Session,
) -> None:
    status_response = setup_client.get("/setup/status")
    assert status_response.status_code == 200
    assert status_response.json()["required"] is True
    assert "one-time-test-setup-token" not in status_response.text

    rejected = setup_client.post(
        "/setup/verify-token",
        headers={"X-CartaVault-Setup-Token": "wrong-token"},
    )
    assert rejected.status_code == 403

    verified = setup_client.post(
        "/setup/verify-token",
        headers={"X-CartaVault-Setup-Token": "one-time-test-setup-token"},
    )
    assert verified.status_code == 200
    assert verified.json() == {"valid": True}

    completed = setup_client.post(
        "/setup/complete",
        headers={"X-CartaVault-Setup-Token": "one-time-test-setup-token"},
        json={
            "administrator": {
                "email": "first-admin@example.test",
                "display_name": "First administrator",
                "password": "test-only-long-password",
                "password_confirmation": "test-only-long-password",
                "language": "en",
                "timezone": "Europe/Paris",
            },
            "instance": {
                "instance_name": "Private CartaVault",
                "public_url": "https://cartavault.example.test",
                "default_language": "en",
                "timezone": "Europe/Paris",
                "public_registration_enabled": False,
                "maximum_upload_megabytes": 25,
                "support_address": None,
            },
            "email": {
                "provider": "none",
                "api_key": None,
                "sender_address": None,
                "sender_name": "CartaVault",
                "reply_to_address": None,
            },
            "mapping": {
                "default_basemap": "cartavault-light",
                "default_routing_engine": "osrm",
            },
        },
    )
    assert completed.status_code == 200
    assert completed.json()["administrator_email"] == "first-admin@example.test"
    assert database_session.scalar(
        select(func.count()).select_from(User).where(
            User.email == "first-admin@example.test",
            User.is_admin.is_(True),
            User.is_active.is_(True),
        )
    ) == 1

    locked_status = setup_client.get("/setup/status")
    assert locked_status.json() == {"required": False, "locked": True, "checks": []}
    locked_write = setup_client.post(
        "/setup/verify-token",
        headers={"X-CartaVault-Setup-Token": "one-time-test-setup-token"},
    )
    assert locked_write.status_code == 404


@pytest.mark.unit
def test_secret_generation_is_idempotent_and_does_not_redisplay_existing_token(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    environment = tmp_path / ".env"
    environment.write_text(
        "\n".join([
            "POSTGRES_DB=cartavault",
            "POSTGRES_USER=cartavault",
            "POSTGRES_PASSWORD=replace-with-a-long-random-password",
            "DATABASE_URL=postgresql+psycopg://cartavault:replace-with-url-encoded-password@postgres:5432/cartavault",
            "CARTAVAULT_SESSION_SECRET=",
            "CARTAVAULT_SETUP_TOKEN=",
            "CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY=",
            "",
        ]),
        encoding="utf-8",
    )

    assert generate_secrets(environment) == 0
    first_output = capsys.readouterr().out
    first_values = environment.read_text(encoding="utf-8")
    assert "Initial setup token (shown once):" in first_output
    assert "replace-with-a-long-random-password" not in first_values

    assert generate_secrets(environment) == 0
    second_output = capsys.readouterr().out
    assert "already exists and was not displayed" in second_output
    assert environment.read_text(encoding="utf-8") == first_values
