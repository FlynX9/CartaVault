from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import event, select, update

from app.auth.models import User, UserSession
from app.auth.sessions import persist_session_activity


pytestmark = pytest.mark.integration


def _login(integration_client, database_session, monkeypatch) -> tuple[User, UserSession, str]:
    user = User(
        email=f"activity-{uuid4()}@example.test",
        display_name="Session activity",
        password_hash="session-activity-hash",
        is_active=True,
    )
    database_session.add(user)
    database_session.flush()
    monkeypatch.setattr(
        "app.auth.router.verify_password",
        lambda stored, password: (stored == "session-activity-hash" and password == "correct password", False),
    )
    response = integration_client.post(
        "/auth/login",
        json={"email": user.email, "password": "correct password"},
    )
    assert response.status_code == 200
    user_session = database_session.scalar(
        select(UserSession).where(UserSession.user_id == user.id)
    )
    assert user_session is not None
    return user, user_session, response.json()["csrf_token"]


def test_authenticated_navigation_coalesces_activity_writes_and_keeps_session_display_fresh(
    integration_client,
    database_session,
    monkeypatch,
) -> None:
    _, user_session, csrf_token = _login(
        integration_client,
        database_session,
        monkeypatch,
    )
    user_session.last_used_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=6)
    database_session.commit()
    updates = 0
    connection = database_session.connection()

    def count_activity_updates(
        _connection,
        _cursor,
        statement,
        _parameters,
        _context,
        _executemany,
    ) -> None:
        nonlocal updates
        normalized = " ".join(statement.lower().split())
        if normalized.startswith("update user_sessions") and "last_used_at" in normalized:
            updates += 1

    event.listen(connection, "before_cursor_execute", count_activity_updates)
    try:
        assert integration_client.get("/auth/me").status_code == 200
        for _ in range(20):
            assert integration_client.get("/auth/me").status_code == 200
        listed = integration_client.get("/account/sessions")
        assert listed.status_code == 200
        current = next(item for item in listed.json() if item["is_current"])
        displayed_activity = datetime.fromisoformat(current["last_used_at"])
        assert displayed_activity >= datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5)
        assert updates == 1
        assert integration_client.post(
            "/auth/logout",
            headers={"X-CSRF-Token": csrf_token},
        ).status_code == 204
        assert updates == 1
    finally:
        event.remove(connection, "before_cursor_execute", count_activity_updates)
    database_session.refresh(user_session)
    assert user_session.revoked_at is not None


def test_stale_concurrent_observation_cannot_regress_persisted_activity(
    integration_client,
    database_session,
    monkeypatch,
) -> None:
    _, user_session, _ = _login(integration_client, database_session, monkeypatch)
    observed_activity = datetime(2026, 7, 31, 8, 0, 0)
    attempted_activity = observed_activity + timedelta(minutes=10)
    concurrent_activity = attempted_activity + timedelta(minutes=1)
    user_session.last_used_at = observed_activity
    database_session.flush()
    database_session.execute(
        update(UserSession)
        .where(UserSession.id == user_session.id)
        .values(last_used_at=concurrent_activity)
        .execution_options(synchronize_session=False)
    )

    assert not persist_session_activity(
        database_session,
        user_session,
        attempted_activity,
        interval_seconds=300,
    )
    stored_activity = database_session.scalar(
        select(UserSession.last_used_at).where(UserSession.id == user_session.id)
    )
    assert stored_activity == concurrent_activity
