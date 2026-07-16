from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select, update

from app.auth.models import User, UserSession


pytestmark = pytest.mark.integration


def _user(database_session, *, active: bool = True, admin: bool = False) -> User:
    user = User(
        email=f"auth-{uuid4()}@example.test",
        display_name="Authentication test",
        password_hash="stored-test-hash",
        is_admin=admin,
        is_active=active,
    )
    database_session.add(user)
    database_session.flush()
    return user


def test_login_session_me_csrf_logout(integration_client, database_session, monkeypatch) -> None:
    user = _user(database_session)
    monkeypatch.setattr("app.auth.router.verify_password", lambda stored, password: (stored == "stored-test-hash" and password == "correct password", False))

    unknown = integration_client.post("/auth/login", json={"email": "unknown@example.test", "password": "wrong"})
    assert unknown.status_code == 401
    wrong = integration_client.post("/auth/login", json={"email": user.email, "password": "wrong"})
    assert wrong.status_code == 401

    login = integration_client.post("/auth/login", json={"email": user.email.upper(), "password": "correct password"})
    assert login.status_code == 200
    csrf_token = login.json()["csrf_token"]
    assert login.cookies.get("cartavault_session")
    assert login.cookies.get("cartavault_csrf") == csrf_token
    stored_session = database_session.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert stored_session is not None
    assert stored_session.token_hash != login.cookies.get("cartavault_session")
    assert integration_client.get("/auth/me").json()["email"] == user.email

    assert integration_client.post("/auth/logout").status_code == 403
    assert integration_client.post("/auth/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert integration_client.post("/auth/logout", headers={"X-CSRF-Token": csrf_token}).status_code == 204
    assert integration_client.get("/auth/me").status_code == 401


def test_inactive_and_expired_sessions_are_rejected(integration_client, database_session, monkeypatch) -> None:
    inactive = _user(database_session, active=False)
    monkeypatch.setattr("app.auth.router.verify_password", lambda _stored, _password: (True, False))
    assert integration_client.post("/auth/login", json={"email": inactive.email, "password": "password"}).status_code == 403

    active = _user(database_session)
    login = integration_client.post("/auth/login", json={"email": active.email, "password": "password"})
    assert login.status_code == 200
    session = database_session.scalar(select(UserSession).where(UserSession.user_id == active.id))
    assert session is not None
    session.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database_session.flush()
    assert integration_client.get("/auth/me").status_code == 401


def test_change_password_revokes_other_sessions(integration_client, database_session, monkeypatch) -> None:
    user = _user(database_session)
    monkeypatch.setattr("app.auth.router.verify_password", lambda _stored, password: (password in {"login password", "current password"}, False))
    monkeypatch.setattr("app.auth.router.hash_password", lambda password: f"new::{password}")
    login = integration_client.post("/auth/login", json={"email": user.email, "password": "login password"})
    csrf = login.json()["csrf_token"]
    extra = UserSession(
        user_id=user.id,
        token_hash="a" * 64,
        csrf_token_hash="b" * 64,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        last_used_at=datetime.now(UTC).replace(tzinfo=None),
    )
    database_session.add(extra); database_session.flush()
    changed = integration_client.post("/auth/change-password", json={"current_password": "current password", "new_password": "a sufficiently long new password"}, headers={"X-CSRF-Token": csrf})
    assert changed.status_code == 204
    assert user.password_hash == "new::a sufficiently long new password"
    database_session.refresh(extra)
    assert extra.revoked_at is not None


def test_admin_user_management_and_last_admin_guard(integration_client, database_session, auth_user, monkeypatch) -> None:
    monkeypatch.setattr("app.auth.admin_router.hash_password", lambda password: f"admin::{password}")
    created = integration_client.post("/admin/users", json={"email": f"managed-{uuid4()}@example.test", "display_name": "Managed", "password": "long enough password", "is_admin": False, "is_active": True})
    assert created.status_code == 201
    assert "password_hash" not in created.json()
    user_id = created.json()["id"]
    assert any(item["id"] == user_id for item in integration_client.get("/admin/users", params={"q": "managed"}).json())
    assert integration_client.patch(f"/admin/users/{user_id}", json={"display_name": "Renamed", "is_active": False}).json()["is_active"] is False
    assert integration_client.patch(f"/admin/users/{user_id}", json={"is_active": True}).json()["is_active"] is True
    assert integration_client.post(f"/admin/users/{user_id}/reset-password", json={"new_password": "another long password"}).status_code == 204

    database_session.execute(update(User).where(User.id != auth_user.id).values(is_admin=False))
    auth_user.is_admin = True; auth_user.is_active = True; database_session.flush()
    protected = integration_client.patch(f"/admin/users/{auth_user.id}", json={"is_active": False})
    assert protected.status_code == 409
    auth_user.is_admin = False
    assert integration_client.get("/admin/users").status_code == 403
