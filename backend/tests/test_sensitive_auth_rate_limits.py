from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pyotp
import pytest
from sqlalchemy import select

from app.auth.models import EmailMfaCode, User, UserSession
from app.auth.security import hash_token
from app.emails.providers.base import EmailDeliveryError


pytestmark = pytest.mark.integration


@pytest.fixture
def sensitive_client(integration_client, auth_user, monkeypatch):
    for module in ("app.auth.router", "app.auth.account_router", "app.auth.email_mfa_router", "app.auth.totp_router"):
        monkeypatch.setattr(f"{module}.verify_password", lambda _stored, password: (password == "current password", False))
    login = integration_client.post("/auth/login", json={"email": auth_user.email, "password": "current password"})
    assert login.status_code == 200
    return integration_client, auth_user, login.json()["csrf_token"]


def _headers(csrf: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf}


def _change_email(client, csrf: str, password: str):
    return client.post("/account/change-email", json={"current_password": password, "new_email": f"rate-{uuid4()}@example.test"}, headers=_headers(csrf))


def test_current_password_failures_are_limited_per_user_across_sessions(sensitive_client, database_session) -> None:
    client, user, csrf = sensitive_client
    for _ in range(5):
        assert _change_email(client, csrf, "wrong password").status_code == 400

    limited = _change_email(client, csrf, "wrong password")
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1

    second_session = UserSession(
        user_id=user.id,
        token_hash=hash_token("second-session"),
        csrf_token_hash=hash_token("second-csrf"),
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        last_used_at=datetime.now(UTC).replace(tzinfo=None),
    )
    database_session.add(second_session)
    database_session.commit()
    client.cookies.set("cartavault_session", "second-session")
    client.cookies.set("cartavault_csrf", "second-csrf")
    assert _change_email(client, "second-csrf", "wrong password").status_code == 429


def test_current_password_limit_allows_success_and_is_independent_per_user(sensitive_client, integration_client, database_session) -> None:
    client, first_user, csrf = sensitive_client
    for _ in range(4):
        assert _change_email(client, csrf, "wrong password").status_code == 400
    assert _change_email(client, csrf, "current password").status_code == 200

    second_user = User(email=f"rate-other-{uuid4()}@example.test", display_name="Other", password_hash="test", is_active=True, quota_profile_id=first_user.quota_profile_id)
    database_session.add(second_user)
    database_session.commit()
    integration_client.cookies.clear()
    login = integration_client.post("/auth/login", json={"email": second_user.email, "password": "current password"})
    assert login.status_code == 200
    assert _change_email(integration_client, login.json()["csrf_token"], "wrong password").status_code == 400


def test_current_password_limit_expires_and_protects_account_totp_and_email_mfa(sensitive_client, database_session) -> None:
    client, user, csrf = sensitive_client
    endpoints = [
        ("/account/change-password", {"current_password": "wrong password", "new_password": "A sufficiently strong password 1!", "confirmation": "A sufficiently strong password 1!"}),
        ("/account", {"current_password": "wrong password", "confirmation": "SUPPRIMER MON COMPTE", "acknowledged": True}),
        ("/account/security/totp/setup", {"current_password": "wrong password"}),
        ("/account/security/email-mfa/setup", {"current_password": "wrong password"}),
    ]
    for path, payload in endpoints:
        assert client.request("DELETE" if path == "/account" else "POST", path, json=payload, headers=_headers(csrf)).status_code == 400
    assert _change_email(client, csrf, "wrong password").status_code == 400
    assert _change_email(client, csrf, "wrong password").status_code == 429

    user.sensitive_auth_failure_window_started_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=16)
    user.sensitive_auth_failure_count = 5
    database_session.commit()
    assert _change_email(client, csrf, "wrong password").status_code == 400


def test_remaining_current_password_endpoints_use_the_shared_limit(sensitive_client) -> None:
    client, user, csrf = sensitive_client
    user.totp_enabled = True
    endpoints = [
        ("POST", "/auth/change-password", {"current_password": "wrong password", "new_password": "A sufficiently strong password 1!"}),
        ("POST", "/account/security/email-mfa/disable", {"current_password": "wrong password"}),
        ("POST", "/account/security/totp/disable", {"current_password": "wrong password", "code": "123456"}),
        ("POST", "/account/security/totp/recovery-codes/regenerate", {"current_password": "wrong password", "code": "123456"}),
    ]
    for expected_count, (method, path, payload) in enumerate(endpoints, start=1):
        assert client.request(method, path, json=payload, headers=_headers(csrf)).status_code == 400
        assert user.sensitive_auth_failure_count == expected_count


def test_email_mfa_send_has_cooldown_quota_and_keeps_existing_code_confirmable(sensitive_client, database_session, monkeypatch) -> None:
    client, user, csrf = sensitive_client
    sent_codes: list[str] = []
    monkeypatch.setattr("app.auth.email_mfa_router.provider_from_database", lambda _session: object())
    monkeypatch.setattr("app.auth.email_mfa_router.EmailService.send_email_mfa_code", lambda _service, _email, _name, code, _locale: sent_codes.append(code))

    first = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))
    assert first.status_code == 200
    assert len(sent_codes) == 1
    immediate = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))
    assert immediate.status_code == 429
    assert int(immediate.headers["Retry-After"]) >= 1
    assert len(sent_codes) == 1

    active = database_session.scalar(select(EmailMfaCode).where(EmailMfaCode.challenge_token_hash == hash_token(first.json()["challenge_token"])))
    assert active is not None
    confirmed = client.post("/account/security/email-mfa/confirm", json={"challenge_token": first.json()["challenge_token"], "code": sent_codes[0]}, headers=_headers(csrf))
    assert confirmed.status_code == 200

    user.email_mfa_enabled = False
    user.email_mfa_last_sent_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=61)
    user.email_mfa_send_window_started_at = datetime.now(UTC).replace(tzinfo=None)
    user.email_mfa_send_count = 5
    database_session.commit()
    quota = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))
    assert quota.status_code == 429
    assert len(sent_codes) == 1


def test_email_mfa_send_is_available_after_cooldown(sensitive_client, database_session, monkeypatch) -> None:
    client, user, csrf = sensitive_client
    sent_codes: list[str] = []
    monkeypatch.setattr("app.auth.email_mfa_router.provider_from_database", lambda _session: object())
    monkeypatch.setattr("app.auth.email_mfa_router.EmailService.send_email_mfa_code", lambda _service, _email, _name, code, _locale: sent_codes.append(code))
    assert client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf)).status_code == 200
    user.email_mfa_last_sent_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=61)
    database_session.commit()
    assert client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf)).status_code == 200
    assert len(sent_codes) == 2


def test_email_mfa_provider_failure_keeps_reservation_and_challenge(sensitive_client, database_session, monkeypatch) -> None:
    client, user, csrf = sensitive_client
    monkeypatch.setattr("app.auth.email_mfa_router.provider_from_database", lambda _session: object())

    def fail_send(*_args, **_kwargs):
        raise EmailDeliveryError("EMAIL_PROVIDER_TIMEOUT", retryable=True)

    monkeypatch.setattr("app.auth.email_mfa_router.EmailService.send_email_mfa_code", fail_send)
    failed = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))

    assert failed.status_code == 503
    database_session.refresh(user)
    assert user.email_mfa_last_sent_at is not None
    assert user.email_mfa_send_count == 1
    assert database_session.scalar(select(EmailMfaCode).where(EmailMfaCode.user_id == user.id, EmailMfaCode.purpose == "enable", EmailMfaCode.used_at.is_(None))) is not None

    retry = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))
    assert retry.status_code == 429


def test_email_mfa_provider_is_called_only_after_database_commit(sensitive_client, database_session, monkeypatch) -> None:
    client, user, csrf = sensitive_client
    monkeypatch.setattr("app.auth.email_mfa_router.provider_from_database", lambda _session: object())
    committed_challenges: list[bool] = []

    def send_after_commit(*_args, **_kwargs):
        committed_challenges.append(database_session.scalar(select(EmailMfaCode).where(EmailMfaCode.user_id == user.id, EmailMfaCode.purpose == "enable", EmailMfaCode.used_at.is_(None))) is not None)

    monkeypatch.setattr("app.auth.email_mfa_router.EmailService.send_email_mfa_code", send_after_commit)
    response = client.post("/account/security/email-mfa/setup", json={"current_password": "current password"}, headers=_headers(csrf))

    assert response.status_code == 200
    assert committed_challenges == [True]
