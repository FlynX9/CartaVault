from urllib.error import URLError
from uuid import uuid4

import pytest

from app.auth.dependencies import get_current_user
from app.auth.models import SystemCredential, User
from app.main import app


pytestmark = pytest.mark.integration


def _user(database_session, label: str, *, admin: bool = False, active: bool = True) -> User:
    user = User(
        email=f"{label}-{uuid4()}@example.test",
        display_name=label,
        password_hash="test-only-hash",
        is_admin=admin,
        is_active=active,
    )
    database_session.add(user)
    database_session.flush()
    return user


def test_admin_console_rejects_standard_user(integration_client, database_session, auth_user) -> None:
    auth_user.is_admin = False
    database_session.flush()

    response = integration_client.get("/admin/console/users")

    assert response.status_code == 403


def test_admin_users_are_paginated_searchable_and_self_protected(integration_client, database_session, auth_user) -> None:
    matching = _user(database_session, "Needle Person")
    _user(database_session, "Other Person")

    page = integration_client.get("/admin/console/users", params={"q": "needle", "page_size": 1})
    self_demotion = integration_client.patch(f"/admin/console/users/{auth_user.id}", json={"role": "user"})
    activation = integration_client.patch(f"/admin/console/users/{matching.id}", json={"is_active": False})

    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["email"] == matching.email
    assert self_demotion.status_code == 409
    assert self_demotion.json()["detail"]["code"] == "ADMIN_SELF_PROTECTION"
    assert activation.status_code == 200
    assert activation.json()["state"] == "inactive"


def test_admin_credentials_never_expose_secrets(integration_client, database_session) -> None:
    secret = "re_secret-that-must-never-be-returned"
    database_session.add(SystemCredential(
        provider="resend",
        encrypted_secret=secret,
        encryption_version=1,
        secret_last4="rned",
    ))
    database_session.flush()

    response = integration_client.get("/admin/console/credentials")
    body = response.text

    assert response.status_code == 200
    assert secret not in body
    resend = next(item for item in response.json() if item["provider"] == "resend")
    assert resend["masked_value"].endswith("rned")
    google = next(item for item in response.json() if item["provider"] == "google_routes")
    assert google["scope"] == "personal"
    assert google["editable"] is False
    encryption = next(item for item in response.json() if item["provider"] == "credential_encryption")
    assert encryption["editable"] is False
    assert "value" not in encryption


def test_admin_quotas_report_usage_and_do_not_delete_data(integration_client, poi_map, database_session) -> None:
    before_maps = database_session.query(type(poi_map)).count()

    saved = integration_client.put("/admin/console/quotas", json={"maps": 1, "places": 25, "photo_storage_bytes": None, "photo_file_bytes": 1024, "members_per_map": 3})
    overview = integration_client.get("/admin/console/quotas")
    blocked = integration_client.post("/maps", json={"country_id": str(poi_map.country_id), "name": "Quota blocked"})

    assert saved.status_code == 200
    assert overview.status_code == 200
    assert overview.json()["global_limits"]["maps"] == 1
    assert overview.json()["aggregate_usage"]["maps"] >= 1
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "QUOTA_MAPS_EXCEEDED"
    assert "google_routes_requests" in overview.json()["unavailable_metrics"]
    assert database_session.query(type(poi_map)).count() == before_maps


def test_instance_diagnostics_isolate_service_failure_and_hide_sensitive_values(integration_client, monkeypatch) -> None:
    monkeypatch.setattr("app.instance_status.service.urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(URLError("secret-host")))

    response = integration_client.get("/admin/console/instance")

    assert response.status_code == 200
    payload = response.json()
    assert payload["components"]["database"]["status"] == "operational"
    assert payload["components"]["database"]["postgis_available"] is True
    assert payload["components"]["routing"]["status"] == "degraded"
    assert payload["components"]["routing"]["last_error_code"] == "OSRM_UNAVAILABLE"
    assert "secret-host" not in response.text
    assert "DATABASE_URL" not in response.text
    assert "encrypted_secret" not in response.text


def test_instance_diagnostics_reject_standard_user(integration_client, database_session, auth_user) -> None:
    auth_user.is_admin = False
    database_session.flush()

    response = integration_client.get("/admin/console/instance")

    assert response.status_code == 403


def test_instance_diagnostics_requires_authentication(integration_client, auth_user) -> None:
    app.dependency_overrides.pop(get_current_user, None)

    try:
        response = integration_client.get("/admin/console/instance")
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user

    assert response.status_code == 401
