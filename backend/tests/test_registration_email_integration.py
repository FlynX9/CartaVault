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
    monkeypatch.setattr("app.maps.router.provider_from_database", lambda _session: provider)
    monkeypatch.setattr("app.emails.notifications.provider_from_database", lambda _session: provider)
    return provider


def test_unknown_map_invitee_receives_registration_email(
    integration_client,
    database_session,
    auth_user,
    monkeypatch,
) -> None:
    from app.countries.models import Country
    from app.maps.models import MapMembership, PoiMap

    provider = _install_provider(monkeypatch)
    country = database_session.query(Country).filter_by(iso_alpha3="BEL").one()
    poi_map = PoiMap(name="Shared with a new account", country_id=country.id, owner_id=auth_user.id, is_private=True)
    database_session.add(poi_map)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=auth_user.id, role="owner"))
    database_session.commit()

    recipient = f"invitee-{uuid4()}@example.test"
    created = integration_client.post(f"/maps/{poi_map.id}/invitations", json={"email": recipient, "role": "viewer"})

    assert created.status_code == 201
    assert len(provider.messages) == 1
    message = provider.messages[0]
    assert message.recipients == [recipient]
    assert auth_user.email in message.text
    assert poi_map.name in message.text
    raw_token = created.json()["invitation_url"].rsplit("/", 1)[-1]
    assert f"/invitations/{raw_token}" in message.text


def test_existing_map_invitee_receives_the_private_invitation_link(
    integration_client,
    database_session,
    auth_user,
    monkeypatch,
) -> None:
    from app.countries.models import Country
    from app.maps.models import MapMembership, PoiMap

    provider = _install_provider(monkeypatch)
    recipient = User(email=f"member-{uuid4()}@example.test", display_name="Existing member", password_hash="test-only", is_active=True)
    database_session.add(recipient)
    country = database_session.query(Country).filter_by(iso_alpha3="BEL").one()
    poi_map = PoiMap(name="Shared with an existing account", country_id=country.id, owner_id=auth_user.id, is_private=True)
    database_session.add(poi_map)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=auth_user.id, role="owner"))
    database_session.commit()

    created = integration_client.post(f"/maps/{poi_map.id}/invitations", json={"email": recipient.email, "role": "viewer"})

    assert created.status_code == 201
    assert len(provider.messages) == 1
    raw_token = created.json()["invitation_url"].rsplit("/", 1)[-1]
    assert provider.messages[0].recipients == [recipient.email]
    assert f"/invitations/{raw_token}" in provider.messages[0].text


def test_registration_requires_admin_approval_before_user_creation(integration_client, database_session, monkeypatch) -> None:
    provider = _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"pending::{password}")
    email = f"candidate-{uuid4()}@example.test"

    registered = integration_client.post("/auth/register", json={"email": email.upper(), "password": "a sufficiently long password", "confirmation": "a sufficiently long password", "terms_accepted": True})

    assert registered.status_code == 202
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email))
    assert request is not None and request.status == "awaiting_email"
    assert database_session.scalar(select(User).where(User.email == email)) is None
    assert provider.messages[0].recipients == [email]
    verification_match = re.search(r"token=([A-Za-z0-9_-]+)", provider.messages[0].text)
    assert verification_match is not None
    verified = integration_client.post("/auth/register/verify", json={"token": verification_match.group(1)})
    assert verified.status_code == 202
    database_session.refresh(request)
    assert request.status == "pending" and request.email_verified_at is not None
    assert integration_client.post("/auth/register", json={"email": email, "password": "a sufficiently long password", "confirmation": "a sufficiently long password", "terms_accepted": True}).status_code == 202

    approved = integration_client.post(f"/admin/registration-requests/{request.id}/approve")

    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    created = database_session.scalar(select(User).where(User.email == email))
    assert created is not None and created.password_hash == "pending::a sufficiently long password"
    assert provider.messages[-1].recipients == [email]


def test_registration_can_be_activated_after_email_confirmation_without_admin_review(integration_client, database_session, monkeypatch) -> None:
    provider = _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"automatic::{password}")
    from app.auth.registration_settings import update_public_registration_settings
    update_public_registration_settings(database_session, enabled=True, approval_required=False)
    database_session.commit()
    email = f"automatic-{uuid4()}@example.test"

    registered = integration_client.post("/auth/register", json={"email": email, "password": "a sufficiently long password", "confirmation": "a sufficiently long password", "terms_accepted": True})
    assert registered.status_code == 202
    verification_match = re.search(r"token=([A-Za-z0-9_-]+)", provider.messages[0].text)
    assert verification_match is not None

    verified = integration_client.post("/auth/register/verify", json={"token": verification_match.group(1)})
    assert verified.status_code == 202
    assert verified.json()["status"] == "approved"
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email))
    created = database_session.scalar(select(User).where(User.email == email))
    assert request is not None and request.status == "approved"
    assert created is not None and created.password_hash == "automatic::a sufficiently long password"


def test_rejected_registration_does_not_create_a_user(integration_client, database_session, monkeypatch) -> None:
    _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.public_router.hash_password", lambda password: f"pending::{password}")
    email = f"rejected-{uuid4()}@example.test"
    assert integration_client.post("/auth/register", json={"email": email, "password": "a sufficiently long password", "confirmation": "a sufficiently long password", "terms_accepted": True}).status_code == 202
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
    assert len(provider.messages) == 2
    assert "mot de passe" in provider.messages[-1].subject.lower()
    assert integration_client.post("/auth/password-reset/confirm", json={"token": raw_token, "password": "another brand new password", "confirmation": "another brand new password"}).status_code == 400


def test_account_security_changes_notify_old_and_current_addresses(
    integration_client,
    database_session,
    auth_user,
    monkeypatch,
) -> None:
    provider = _install_provider(monkeypatch)
    monkeypatch.setattr("app.auth.router.verify_password", lambda _hash, _password: (True, False))
    login = integration_client.post("/auth/login", json={"email": auth_user.email, "password": "current password"})
    assert login.status_code == 200
    headers = {"X-CSRF-Token": login.json()["csrf_token"]}
    monkeypatch.setattr("app.auth.account_router.verify_password", lambda _hash, _password: (True, False))

    old_email = auth_user.email
    new_email = f"changed-{uuid4()}@example.test"
    changed_email = integration_client.post(
        "/account/change-email",
        json={"current_password": "current password", "new_email": new_email},
        headers=headers,
    )

    assert changed_email.status_code == 200
    assert [message.recipients for message in provider.messages] == [[old_email], [new_email]]
    assert all(old_email in message.text and new_email in message.text for message in provider.messages)

    headers = {"X-CSRF-Token": integration_client.cookies.get("cartavault_csrf")}
    monkeypatch.setattr("app.auth.account_router.hash_password", lambda password: f"changed::{password}")
    changed_password = integration_client.post(
        "/account/change-password",
        json={
            "current_password": "current password",
            "new_password": "a new sufficiently long password",
            "confirmation": "a new sufficiently long password",
        },
        headers=headers,
    )

    assert changed_password.status_code == 204
    assert provider.messages[-1].recipients == [new_email]
    assert "mot de passe" in provider.messages[-1].subject.lower()


def test_administrator_password_reset_sends_the_same_security_alert(
    integration_client,
    database_session,
    monkeypatch,
) -> None:
    provider = _install_provider(monkeypatch)
    user = User(
        email=f"managed-{uuid4()}@example.test",
        display_name="Managed user",
        password_hash="old-password-hash",
        is_active=True,
    )
    database_session.add(user)
    database_session.commit()

    response = integration_client.post(
        f"/admin/users/{user.id}/reset-password",
        json={"new_password": "a new administrator supplied password"},
    )

    assert response.status_code == 204
    assert len(provider.messages) == 1
    assert provider.messages[0].recipients == [user.email]
    assert "mot de passe" in provider.messages[0].subject.lower()
