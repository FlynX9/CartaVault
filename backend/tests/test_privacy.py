from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.auth.dependencies import get_current_session, require_admin
from app.auth.models import AuthSecurityEvent, UserApiCredential, UserSession
from app.main import app
from app.privacy.router import _data_export
from app.privacy.service import purge_expired_privacy_artifacts
from app.privacy.settings import PrivacySettings


def test_privacy_configuration_is_disabled_by_default(integration_client):
    response = integration_client.get("/api/privacy/configuration")

    assert response.status_code == 200
    assert response.json()["analytics_mode"] == "disabled"
    assert response.json()["consent_required"] is False


def test_admin_can_configure_privacy_and_user_can_manage_consent(integration_client, database_session, auth_user):
    app.dependency_overrides[get_current_session] = lambda: SimpleNamespace(user=auth_user)
    app.dependency_overrides[require_admin] = lambda: auth_user
    try:
        settings = integration_client.put("/api/admin/console/privacy/settings", json={
            "analytics_mode": "consent_required",
            "operator_name": "CartaVault SAS",
            "privacy_policy_url": "https://example.test/privacy",
            "cookie_policy_url": "https://example.test/cookies",
            "contact_email": "privacy@example.test",
            "auth_log_retention_days": 45,
            "session_retention_days": 30,
            "deleted_account_retention_days": 0,
        })
        assert settings.status_code == 200
        assert settings.json()["consent_required"] is True

        saved = integration_client.put("/api/account/privacy/consent", json={"analytics": True, "functional_optional": False, "marketing": False, "third_party": False})
        assert saved.status_code == 200
        assert saved.json()["analytics"] is True
        assert saved.json()["necessary"] is True
        assert saved.json()["updated_at"] is not None

        read = integration_client.get("/api/account/privacy/consent")
        assert read.status_code == 200
        assert read.json()["analytics"] is True
    finally:
        app.dependency_overrides.pop(get_current_session, None)
        app.dependency_overrides.pop(require_admin, None)


def test_admin_rejects_an_invalid_privacy_contact_email(integration_client, auth_user):
    app.dependency_overrides[require_admin] = lambda: auth_user
    try:
        response = integration_client.put("/api/admin/console/privacy/settings", json={"contact_email": "admin-at-example.fr"})

        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(require_admin, None)


def test_personal_export_excludes_credentials_and_media_binary_paths(database_session, auth_user, poi_map):
    database_session.add(UserApiCredential(
        user_id=auth_user.id,
        provider="google",
        name="Private key",
        encrypted_secret="must-never-leak",
        encryption_version=1,
        secret_last4="1234",
    ))
    database_session.flush()

    export = _data_export(database_session, auth_user)
    serialized = json.dumps(export, default=str)

    assert export["account"]["id"] == auth_user.id
    assert poi_map.id in [item["id"] for item in export["owned_maps"]]
    assert "must-never-leak" not in serialized
    assert "password_hash" not in serialized
    assert "encrypted_secret" not in serialized
    assert "path" not in serialized


def test_privacy_cleanup_removes_expired_security_artifacts_only(database_session, auth_user):
    expired = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2)
    event = AuthSecurityEvent(event_type="login", outcome="success", actor_user_id=auth_user.id, occurred_at=expired)
    database_session.add(event)
    database_session.flush()

    purge_expired_privacy_artifacts(database_session, PrivacySettings(auth_log_retention_days=1))

    assert database_session.get(AuthSecurityEvent, event.id) is None


def test_privacy_cleanup_applies_session_retention(database_session, auth_user):
    now = datetime.now(UTC).replace(tzinfo=None)
    stale = UserSession(
        user_id=auth_user.id,
        token_hash="z" * 64,
        csrf_token_hash="y" * 64,
        created_at=now - timedelta(days=31),
        last_used_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=7),
    )
    database_session.add(stale)
    database_session.flush()

    purge_expired_privacy_artifacts(database_session, PrivacySettings(session_retention_days=30))

    assert database_session.get(UserSession, stale.id) is None
