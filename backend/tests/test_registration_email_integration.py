from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.models import AuthActionToken, RegistrationRequest, User, UserSession
from app.emails.providers.base import EmailMessage


pytestmark = pytest.mark.integration


class RecordingProvider:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> str:
        self.messages.append(message)
        return f"message-{len(self.messages)}"


def _install_provider(monkeypatch: pytest.MonkeyPatch) -> RecordingProvider:
    provider = RecordingProvider()
    monkeypatch.setattr("app.auth.public_router.provider_from_database", lambda _session: provider)
    monkeypatch.setattr("app.auth.registration_admin_router.provider_from_database", lambda _session: provider)
    return provider


def test_registration_requires_admin_approval_before_user_creation(integration_client, database_session, monkeypatch) -> None:
    provider = _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"pending::{password}")
    email = f"candidate-{uuid4()}@example.test"

    registered = integration_client.post("/auth/register", json={"email": email.upper(), "password": "a sufficiently long password", "confirmation": "a sufficiently long password"})

    assert registered.status_code == 202
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email))
    assert request is not None and request.status == "pending"
    assert database_session.scalar(select(User).where(User.email == email)) is None
    assert provider.messages[0].recipients
    assert integration_client.post("/auth/register", json={"email": email, "password": "a sufficiently long password", "confirmation": "a sufficiently long password"}).status_code == 409

    approved = integration_client.post(f"/admin/registration-requests/{request.id}/approve")

    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    created = database_session.scalar(select(User).where(User.email == email))
    assert created is not None and created.password_hash == "pending::a sufficiently long password"
    assert provider.messages[-1].recipients == [email]


def test_rejected_registration_does_not_create_a_user(integration_client, database_session, monkeypatch) -> None:
    _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"pending::{password}")
    email = f"rejected-{uuid4()}@example.test"
    assert integration_client.post("/auth/register", json={"email": email, "password": "a sufficiently long password", "confirmation": "a sufficiently long password"}).status_code == 202
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email))

    rejected = integration_client.post(f"/admin/registration-requests/{request.id}/reject")

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert database_session.scalar(select(User).where(User.email == email)) is None


def test_password_reset_is_generic_single_use_and_revokes_sessions(integration_client, database_session, monkeypatch) -> None:
    provider = _install_provider(monkeypatch)
    user = User(email=f"reset-{uuid4()}@example.test", display_name="Reset user", password_hash="old", is_active=True)
    database_session.add(user)
    database_session.flush()
    session = UserSession(user_id=user.id, token_hash="a" * 64, csrf_token_hash="b" * 64, expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1))
    database_session.add(session)
    database_session.flush()
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"reset::{password}")

    known = integration_client.post("/auth/password-reset/request", json={"email": user.email})
    unknown = integration_client.post("/auth/password-reset/request", json={"email": f"unknown-{uuid4()}@example.test"})

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(provider.messages) == 1
    match = re.search(r"token=([A-Za-z0-9_-]+)", provider.messages[0].text)
    assert match is not None
    raw_token = match.group(1)
    stored = database_session.scalar(select(AuthActionToken).where(AuthActionToken.user_id == user.id))
    assert stored is not None and stored.token_hash != raw_token

    confirmed = integration_client.post("/auth/password-reset/confirm", json={"token": raw_token, "password": "a brand new long password", "confirmation": "a brand new long password"})

    assert confirmed.status_code == 204
    assert user.password_hash == "reset::a brand new long password"
    assert stored.used_at is not None
    database_session.refresh(session)
    assert session.revoked_at is not None
    assert integration_client.post("/auth/password-reset/confirm", json={"token": raw_token, "password": "another brand new password", "confirmation": "another brand new password"}).status_code == 400
