from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import select

from app.auth.models import User, UserApiCredential


pytestmark = pytest.mark.integration


def _login(client, monkeypatch, user: User) -> str:
    monkeypatch.setattr("app.auth.router.verify_password", lambda _hash, password: (password == "current password", False))
    response = client.post("/auth/login", json={"email": user.email, "password": "current password"})
    assert response.status_code == 200
    return response.json()["csrf_token"]


def _configure_encryption(monkeypatch) -> None:
    settings = SimpleNamespace(encryption_key=Fernet.generate_key().decode())
    monkeypatch.setattr("app.auth.credential_encryption.credential_settings", settings)


def test_personal_google_credential_lifecycle_is_masked_and_csrf_protected(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    assert integration_client.get("/account/integrations/google-routes").status_code == 401
    csrf = _login(integration_client, monkeypatch, auth_user)
    assert integration_client.get("/account/integrations/google-routes").json()["configured"] is False
    fake_key = "fake-google-key-user-a"
    assert integration_client.put("/account/integrations/google-routes", json={"api_key": fake_key}).status_code == 403
    stored = integration_client.put("/account/integrations/google-routes", json={"api_key": fake_key}, headers={"X-CSRF-Token": csrf})
    assert stored.status_code == 200
    assert stored.json() == {"configured": True, "last4": "er-a", "verified": False, "verified_at": None, "last_used_at": None, "last_error_code": None}
    assert fake_key not in stored.text
    credential = database_session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == auth_user.id))
    assert credential is not None
    assert credential.encrypted_secret != fake_key and fake_key not in credential.encrypted_secret

    replacement = "fake-google-key-user-a-replaced"
    replaced = integration_client.put("/account/integrations/google-routes", json={"api_key": replacement}, headers={"X-CSRF-Token": csrf})
    assert replaced.status_code == 200 and replaced.json()["last4"] == "aced"
    database_session.refresh(credential)
    assert credential.verified_at is None and replacement not in credential.encrypted_secret

    monkeypatch.setattr("app.auth.credential_router.GoogleRoutesProvider.calculate_route", lambda *_args, **_kwargs: SimpleNamespace())
    verified = integration_client.post("/account/integrations/google-routes/verify", headers={"X-CSRF-Token": csrf})
    assert verified.status_code == 200 and verified.json()["verified"] is True
    providers = integration_client.get("/routing/providers").json()
    google = next(item for item in providers["providers"] if item["id"] == "google")
    assert google["available"] is True and google["credential_verified"] is True
    assert "api_key" not in str(providers).lower() and replacement not in str(providers)

    auth_user.preferences = {"routing": {"provider": "google"}}
    database_session.flush()
    monkeypatch.setattr("app.auth.credential_router.verify_password", lambda _hash, password: (password == "current password", False))
    deleted = integration_client.request("DELETE", "/account/integrations/google-routes", json={"current_password": "current password"}, headers={"X-CSRF-Token": csrf})
    assert deleted.status_code == 200 and deleted.json()["provider_reset"] is True
    assert database_session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == auth_user.id)) is None
    assert auth_user.preferences["routing"]["provider"] == "osrm"


def test_credentials_are_isolated_between_users(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    other = User(email=f"other-{uuid4()}@example.test", display_name="Other", password_hash="hash", is_admin=False, is_active=True)
    database_session.add(other); database_session.flush()
    first_csrf = _login(integration_client, monkeypatch, auth_user)
    integration_client.put("/account/integrations/google-routes", json={"api_key": "fake-google-key-user-a"}, headers={"X-CSRF-Token": first_csrf})
    second_csrf = _login(integration_client, monkeypatch, other)
    assert integration_client.get("/account/integrations/google-routes").json()["configured"] is False
    integration_client.put("/account/integrations/google-routes", json={"api_key": "fake-google-key-user-b"}, headers={"X-CSRF-Token": second_csrf})
    rows = database_session.scalars(select(UserApiCredential).where(UserApiCredential.user_id.in_([auth_user.id, other.id]))).all()
    assert len(rows) == 2
    assert {row.secret_last4 for row in rows} == {"er-a", "er-b"}
    assert all("fake-google-key" not in row.encrypted_secret for row in rows)


def test_account_anonymization_deletes_credential(integration_client, database_session, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    user = User(email=f"delete-credential-{uuid4()}@example.test", display_name="Delete", password_hash="hash", is_admin=False, is_active=True)
    database_session.add(user); database_session.flush()
    csrf = _login(integration_client, monkeypatch, user)
    integration_client.put("/account/integrations/google-routes", json={"api_key": "fake-google-key-delete"}, headers={"X-CSRF-Token": csrf})
    monkeypatch.setattr("app.auth.account_router.verify_password", lambda *_: (True, False))
    response = integration_client.request("DELETE", "/account", json={"current_password": "current password", "confirmation": "SUPPRIMER MON COMPTE", "acknowledged": True}, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204
    assert database_session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user.id)) is None
