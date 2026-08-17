from datetime import UTC, datetime, timedelta
from uuid import uuid4
import pytest
from sqlalchemy import select

from app.auth.models import User, UserApiCredential, UserSession

pytestmark = pytest.mark.integration


def _login(client, database_session, monkeypatch, user: User):
    monkeypatch.setattr("app.auth.router.verify_password", lambda _hash, password: (password == "current password", False))
    response = client.post("/auth/login", json={"email": user.email, "password": "current password"})
    assert response.status_code == 200
    return response.json()["csrf_token"]


def test_account_profile_email_password_and_sessions(integration_client, database_session, auth_user, monkeypatch) -> None:
    csrf = _login(integration_client, database_session, monkeypatch, auth_user)
    headers = {"X-CSRF-Token": csrf}
    profile = integration_client.get("/account/profile")
    assert profile.status_code == 200 and profile.json()["display_name"] == auth_user.display_name
    assert profile.json()["email_verified"] is True
    assert integration_client.patch("/account/profile", json={"display_name": "  Greg  "}, headers=headers).json()["display_name"] == "Greg"
    assert integration_client.patch("/account/profile", json={"display_name": "<b>x</b>"}, headers=headers).status_code == 422

    extra = UserSession(user_id=auth_user.id, token_hash="c" * 64, csrf_token_hash="d" * 64, expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1), last_used_at=datetime.now(UTC).replace(tzinfo=None), user_agent="Other browser")
    database_session.add(extra); database_session.flush()
    monkeypatch.setattr("app.auth.account_router.verify_password", lambda _hash, password: (password == "current password", False))
    changed_email = integration_client.post("/account/change-email", json={"current_password": "current password", "new_email": f"NEW-{uuid4()}@Example.Test"}, headers=headers)
    assert changed_email.status_code == 200 and changed_email.json()["email"].endswith("@example.test")
    database_session.refresh(extra); assert extra.revoked_at is not None
    headers = {"X-CSRF-Token": integration_client.cookies.get("cartavault_csrf")}

    extra2 = UserSession(user_id=auth_user.id, token_hash="e" * 64, csrf_token_hash="f" * 64, expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1), last_used_at=datetime.now(UTC).replace(tzinfo=None))
    database_session.add(extra2); database_session.flush()
    monkeypatch.setattr("app.auth.account_router.hash_password", lambda password: f"account::{password}")
    weak_password = integration_client.post("/account/change-password", json={"current_password": "current password", "new_password": "a new sufficiently long password", "confirmation": "a new sufficiently long password"}, headers=headers)
    assert weak_password.status_code == 422
    changed_password = integration_client.post("/account/change-password", json={"current_password": "current password", "new_password": "New Strong Password 42!", "confirmation": "New Strong Password 42!"}, headers=headers)
    assert changed_password.status_code == 204 and auth_user.password_hash.startswith("account::")
    database_session.refresh(extra2); assert extra2.revoked_at is not None

    listed = integration_client.get("/account/sessions").json()
    assert len(listed) == 1 and listed[0]["is_current"] is True
    assert all("token" not in key and "csrf" not in key for key in listed[0])


def test_account_deletion_guards_and_anonymizes(integration_client, database_session, auth_user, monkeypatch) -> None:
    user = User(email=f"delete-{uuid4()}@example.test", display_name="Delete me", password_hash="hash", is_admin=False, is_active=True)
    database_session.add(user); database_session.flush()
    csrf = _login(integration_client, database_session, monkeypatch, user)
    monkeypatch.setattr("app.auth.account_router.verify_password", lambda _hash, password: (password == "current password", False))
    response = integration_client.request("DELETE", "/account", json={"current_password": "current password", "confirmation": "SUPPRIMER MON COMPTE", "acknowledged": True}, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204
    database_session.refresh(user)
    assert user.is_active is False and user.deleted_at is not None
    assert user.email == f"deleted-{user.id}@invalid.local"
    assert integration_client.get("/auth/me").status_code == 401


def test_account_preferences_are_validated_and_isolated(integration_client, database_session, auth_user, monkeypatch) -> None:
    csrf = _login(integration_client, database_session, monkeypatch, auth_user)
    headers = {"X-CSRF-Token": csrf}
    defaults = integration_client.get("/account/preferences")
    assert defaults.status_code == 200
    assert defaults.json()["language"] == "fr"
    assert defaults.json()["default_theme"] == "system"
    assert defaults.json()["preferred_basemap"] == "osm"
    assert defaults.json()["basemaps"]["classic_provider"] == "osm"
    assert defaults.json()["basemaps"]["satellite_provider"] == "none"
    assert defaults.json()["photo_markers_enabled"] is False
    assert defaults.json()["routing"]["provider"] == "osrm"
    assert set(defaults.json()["routing"]) == {"provider", "api_key_id"}
    providers = integration_client.get("/routing/providers")
    assert providers.status_code == 200
    assert providers.json()["default_provider"] == "osrm"
    assert "api_key" not in providers.text.lower()

    updated = integration_client.put(
        "/account/preferences",
        json={"language": "en", "default_theme": "dark", "preferred_basemap": "cartavault-light", "density": "spacious", "startup_panel": "dashboard", "timezone": "Europe/Paris", "photo_markers_enabled": True, "routing": {"provider": "osrm"}},
        headers=headers,
    )
    assert updated.status_code == 200 and updated.json()["density"] == "spacious"
    assert updated.json()["language"] == "en"
    assert updated.json()["default_theme"] == "dark"
    assert updated.json()["startup_panel"] == "dashboard"
    assert updated.json()["routing"]["provider"] == "osrm"
    assert updated.json()["photo_markers_enabled"] is True
    monkeypatch.setattr("app.auth.account_router.stadia_unauthenticated_allowed", lambda: True)
    stadia = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "preferred_basemap": "stadia-light", "basemaps": {"classic_provider": "stadia", "satellite_provider": "none"}},
        headers=headers,
    )
    assert stadia.status_code == 200
    assert stadia.json()["basemaps"]["classic_provider"] == "stadia"
    unavailable = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "routing": {"provider": "google"}},
        headers=headers,
    )
    assert unavailable.status_code == 409
    assert unavailable.json()["detail"]["code"] == "ROUTING_CREDENTIAL_REQUIRED"
    credential = UserApiCredential(
        user_id=auth_user.id,
        provider="google",
        encrypted_secret="test-ciphertext",
        encryption_version=1,
        secret_last4="fake",
        verified_at=datetime.now(UTC).replace(tzinfo=None),
    )
    database_session.add(credential)
    database_session.flush()
    google = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "routing": {"provider": "google", "api_key_id": str(credential.id)}},
        headers=headers,
    )
    assert google.status_code == 200
    assert google.json()["routing"]["provider"] == "google"
    assert set(google.json()["routing"]) == {"provider", "api_key_id"}
    satellite_without_browser_key = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "basemaps": {"classic_provider": "google", "satellite_provider": "google", "google_satellite_mode": "maps-js", "google_api_key_id": str(credential.id)}},
        headers=headers,
    )
    assert satellite_without_browser_key.status_code == 409
    assert satellite_without_browser_key.json()["detail"]["code"] == "GOOGLE_MAPS_JS_CREDENTIAL_REQUIRED"
    satellite = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "basemaps": {"classic_provider": "google", "satellite_provider": "google", "google_api_key_id": str(credential.id), "google_maps_js_api_key_id": str(credential.id)}},
        headers=headers,
    )
    assert satellite.status_code == 200
    assert satellite.json()["basemaps"]["google_maps_js_api_key_id"] == str(credential.id)
    satellite_tiles = integration_client.put(
        "/account/preferences",
        json={**updated.json(), "preferred_basemap": "google-satellite-tiles", "basemaps": {"classic_provider": "osm", "satellite_provider": "google", "google_satellite_mode": "map-tiles", "google_api_key_id": str(credential.id)}},
        headers=headers,
    )
    assert satellite_tiles.status_code == 200
    assert satellite_tiles.json()["basemaps"]["google_satellite_mode"] == "map-tiles"
    assert integration_client.put("/account/preferences", json={"preferred_basemap": "invalid"}, headers=headers).status_code == 422
    reset = integration_client.post("/account/preferences/reset", headers=headers)
    assert reset.status_code == 200 and reset.json()["density"] == "compact"
    assert reset.json()["language"] == "fr"
    assert reset.json()["photo_markers_enabled"] is False
    assert reset.json()["default_theme"] == "system"
