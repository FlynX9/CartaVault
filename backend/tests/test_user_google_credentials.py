from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import select

from app.auth.credential_encryption import CredentialEncryptionService
from app.auth.models import AdminApiCredential, User, UserApiCredential
from app.quotas.models import QuotaProfile, QuotaProfileApiCredential


pytestmark = pytest.mark.integration


def _login(client, monkeypatch, user: User) -> str:
    monkeypatch.setattr("app.auth.router.verify_password", lambda _hash, password: (password == "current password", False))
    response = client.post("/auth/login", json={"email": user.email, "password": "current password"})
    assert response.status_code == 200
    return response.json()["csrf_token"]


def _configure_encryption(monkeypatch) -> None:
    monkeypatch.setattr("app.auth.credential_encryption.credential_settings", SimpleNamespace(encryption_key=Fernet.generate_key().decode()))


def _create_key(client, csrf: str, *, name: str, provider: str, secret: str):
    return client.post("/account/api-keys", json={"name": name, "provider": provider, "api_key": secret}, headers={"X-CSRF-Token": csrf})


def test_personal_api_key_lifecycle_is_masked_scoped_and_csrf_protected(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    assert integration_client.get("/account/api-keys").status_code == 401
    csrf = _login(integration_client, monkeypatch, auth_user)
    assert _create_key(integration_client, "", name="Google", provider="google", secret="fake-google-key-user-a").status_code == 403
    stored = _create_key(integration_client, csrf, name="Google", provider="google", secret="fake-google-key-user-a")
    assert stored.status_code == 200
    payload = stored.json()
    assert payload["last4"] == "er-a" and payload["verified"] is False
    assert "fake-google-key-user-a" not in stored.text
    credential = database_session.get(UserApiCredential, payload["id"])
    assert credential is not None and "fake-google-key-user-a" not in credential.encrypted_secret

    replacement = integration_client.patch(f"/account/api-keys/{payload['id']}", json={"name": "Google principal", "api_key": "replacement-secret"}, headers={"X-CSRF-Token": csrf})
    assert replacement.status_code == 200 and replacement.json()["last4"] == "cret"
    deleted = integration_client.delete(f"/account/api-keys/{payload['id']}", headers={"X-CSRF-Token": csrf})
    assert deleted.status_code == 200
    assert database_session.get(UserApiCredential, payload["id"]) is None


def test_credentials_are_isolated_between_users(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    other = User(email=f"other-{uuid4()}@example.test", display_name="Other", password_hash="hash", is_admin=False, is_active=True)
    database_session.add(other); database_session.flush()
    first_csrf = _login(integration_client, monkeypatch, auth_user)
    first = _create_key(integration_client, first_csrf, name="First", provider="google", secret="fake-google-key-user-a").json()
    second_csrf = _login(integration_client, monkeypatch, other)
    assert integration_client.get("/account/api-keys").json() == []
    assert integration_client.patch(f"/account/api-keys/{first['id']}", json={"name": "stolen"}, headers={"X-CSRF-Token": second_csrf}).status_code == 404
    _create_key(integration_client, second_csrf, name="Second", provider="google", secret="fake-google-key-user-b")
    rows = database_session.scalars(select(UserApiCredential).where(UserApiCredential.user_id.in_([auth_user.id, other.id]))).all()
    assert len(rows) == 2 and {row.secret_last4 for row in rows} == {"er-a", "er-b"}


def test_quota_shared_instance_key_is_read_only_and_usable_for_authorized_service(
    integration_client, database_session, auth_user, monkeypatch
) -> None:
    _configure_encryption(monkeypatch)
    encrypted = CredentialEncryptionService.from_settings().encrypt("shared-google-places-secret")
    key = AdminApiCredential(
        provider="google", name="Google partagé", encrypted_secret=encrypted.ciphertext,
        encryption_version=encrypted.version, secret_last4="cret", capabilities=["places_search"],
    )
    profile = QuotaProfile(name=f"Shared keys {uuid4()}", is_active=True)
    profile.api_credential_links.append(QuotaProfileApiCredential(api_credential=key))
    auth_user.quota_profile = profile
    database_session.add_all([key, profile])
    database_session.commit()
    csrf = _login(integration_client, monkeypatch, auth_user)

    catalog = integration_client.get("/account/api-keys")
    assert catalog.status_code == 200
    shared = catalog.json()[0]
    assert shared["id"] == str(key.id)
    assert shared["source"] == "instance" and shared["editable"] is False
    assert shared["capabilities"] == ["places_search"]
    assert "shared-google-places-secret" not in catalog.text
    assert integration_client.patch(
        f"/account/api-keys/{key.id}", json={"name": "stolen"}, headers={"X-CSRF-Token": csrf}
    ).status_code == 404

    auth_user.preferences = {"places": {"provider": "google", "api_key_id": str(key.id)}}
    database_session.commit()
    calls: list[str] = []
    monkeypatch.setattr(
        "app.auth.google_places_credential_router.search_google_places",
        lambda secret, *_args, **_kwargs: calls.append(secret) or [],
    )
    response = integration_client.get("/account/integrations/google-places/search", params={"q": "Paris"})
    assert response.status_code == 200
    assert calls == ["shared-google-places-secret"]

    key.capabilities = ["routing"]
    database_session.commit()
    unavailable = integration_client.get(
        "/account/integrations/google-places/search", params={"q": "Paris"}
    )
    assert unavailable.status_code == 200
    assert unavailable.json()["available"] is False
    assert calls == ["shared-google-places-secret"]


def test_selected_google_key_searches_places_without_exposing_secret(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    csrf = _login(integration_client, monkeypatch, auth_user)
    api_key = "fake-google-key-places"
    created = _create_key(integration_client, csrf, name="Places", provider="google", secret=api_key).json()
    credential = database_session.get(UserApiCredential, created["id"])
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None)
    auth_user.preferences = {"places": {"provider": "google", "api_key_id": created["id"]}}
    database_session.commit()
    calls = []

    def fake_search(key: str, query: str, country: str | None, limit: int):
        calls.append((key, query, country, limit))
        return [SimpleNamespace(id="google:panorama", name="Panorama", formatted_address="Tbilisi", latitude=41.69, longitude=44.81, country_code="GE", locality="Tbilisi", postal_code="0103")]

    monkeypatch.setattr("app.auth.google_places_credential_router.search_google_places", fake_search)
    response = integration_client.get("/account/integrations/google-places/search", params={"q": "Panorama", "country_code": "GE"})
    assert response.status_code == 200 and response.json()["items"][0]["name"] == "Panorama"
    assert calls[0][0] == api_key and api_key not in response.text


def test_google_satellite_uses_an_explicit_browser_key_and_marks_a_real_map_load(integration_client, database_session, auth_user, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    csrf = _login(integration_client, monkeypatch, auth_user)
    api_key = "fake-browser-restricted-maps-js-key"
    created = _create_key(integration_client, csrf, name="Google Maps JavaScript", provider="google", secret=api_key).json()

    auth_user.preferences = {
        "language": "en",
        "basemaps": {
            "classic_provider": "google",
            "satellite_provider": "google",
            "google_api_key_id": created["id"],
        },
    }
    database_session.commit()
    legacy_only = integration_client.get("/basemaps/google-satellite/maps-js/config")
    assert legacy_only.status_code == 503
    assert legacy_only.json()["detail"]["code"] == "GOOGLE_MAPS_JS_UNAVAILABLE"

    preferences = dict(auth_user.preferences)
    preferences["basemaps"] = {**preferences["basemaps"], "google_maps_js_api_key_id": created["id"]}
    auth_user.preferences = preferences
    database_session.commit()
    config = integration_client.get("/basemaps/google-satellite/maps-js/config")
    assert config.status_code == 200
    assert config.headers["cache-control"] == "private, no-store"
    assert config.json() == {"api_key": api_key, "language": "en", "region": "", "map_type": "satellite"}

    roadmap = integration_client.get("/basemaps/google-satellite/maps-js/config", params={"map_type": "roadmap"})
    assert roadmap.status_code == 200
    assert roadmap.json() == {"api_key": api_key, "language": "en", "region": "", "map_type": "roadmap"}

    loaded = integration_client.post("/basemaps/google-satellite/maps-js/loaded", json={"map_type": "satellite"}, headers={"X-CSRF-Token": csrf})
    assert loaded.status_code == 200 and loaded.json() == {"loaded": True}
    roadmap_loaded = integration_client.post("/basemaps/google-satellite/maps-js/loaded", json={"map_type": "roadmap"}, headers={"X-CSRF-Token": csrf})
    assert roadmap_loaded.status_code == 200 and roadmap_loaded.json() == {"loaded": True}
    credential = database_session.get(UserApiCredential, created["id"])
    database_session.refresh(credential)
    assert credential.verified_at is not None and credential.last_used_at is not None


def test_account_anonymization_deletes_all_personal_keys(integration_client, database_session, monkeypatch) -> None:
    _configure_encryption(monkeypatch)
    user = User(email=f"delete-credential-{uuid4()}@example.test", display_name="Delete", password_hash="hash", is_admin=False, is_active=True)
    database_session.add(user); database_session.flush()
    csrf = _login(integration_client, monkeypatch, user)
    _create_key(integration_client, csrf, name="Google", provider="google", secret="fake-google-key-delete")
    _create_key(integration_client, csrf, name="Stadia", provider="stadia", secret="fake-stadia-key-delete")
    monkeypatch.setattr("app.auth.account_router.verify_password", lambda *_: (True, False))
    response = integration_client.request("DELETE", "/account", json={"current_password": "current password", "confirmation": "SUPPRIMER MON COMPTE", "acknowledged": True}, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 204
    assert database_session.scalars(select(UserApiCredential).where(UserApiCredential.user_id == user.id)).all() == []
