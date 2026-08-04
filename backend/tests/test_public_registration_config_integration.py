from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.admin.models import SystemSetting
from app.auth.dependencies import get_current_user
from app.database import get_db
from app.main import app


pytestmark = pytest.mark.integration


def test_public_registration_is_disabled_without_explicit_instance_setting(integration_client, database_session) -> None:
    database_session.delete(database_session.get(SystemSetting, "instance"))
    database_session.commit()

    status = integration_client.get("/auth/registration-status").json()
    assert status["enabled"] is False
    assert status["terms_version"]
    response = integration_client.post("/auth/register", json={"email": "visitor@example.test", "password": "a sufficiently long password", "confirmation": "a sufficiently long password", "terms_accepted": True})

    assert response.status_code == 403


def test_admin_can_enable_registration_but_regular_users_cannot(integration_client, database_session) -> None:
    database_session.delete(database_session.get(SystemSetting, "instance"))
    database_session.commit()

    assert integration_client.put("/admin/public-registration", json={"enabled": True}).json() == {"enabled": True}
    assert integration_client.get("/auth/registration-status").json()["enabled"] is True

    previous_override = app.dependency_overrides[get_current_user]
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=None, is_admin=False, is_active=True)
    try:
        response = integration_client.put("/admin/public-registration", json={"enabled": False})
    finally:
        app.dependency_overrides[get_current_user] = previous_override

    assert response.status_code == 403
