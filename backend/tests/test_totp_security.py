from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select

from app.auth.models import TotpRecoveryCode, User, UserSession
from app.auth.security import hash_token


pytestmark = pytest.mark.integration


@pytest.fixture
def totp_client(integration_client, auth_user, monkeypatch):
    monkeypatch.setattr(
        "app.auth.router.verify_password",
        lambda _stored, password: (password == "current password", False),
    )
    monkeypatch.setattr(
        "app.auth.totp_router.verify_password",
        lambda _stored, password: (password == "current password", False),
    )
    monkeypatch.setattr(
        "app.auth.credential_encryption.credential_settings",
        SimpleNamespace(encryption_key=Fernet.generate_key().decode("ascii")),
    )
    login = integration_client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "current password"},
    )
    assert login.status_code == 200
    return integration_client, auth_user, login.json()["csrf_token"]


def test_totp_setup_requires_current_password_without_partial_state(totp_client) -> None:
    client, user, csrf = totp_client

    missing = client.post("/account/security/totp/setup", json={}, headers={"X-CSRF-Token": csrf})
    assert missing.status_code == 422
    assert user.totp_secret_encrypted is None
    assert user.totp_enrollment_expires_at is None


def test_totp_setup_rejects_wrong_password_without_partial_state(totp_client) -> None:
    client, user, csrf = totp_client

    wrong = client.post(
        "/account/security/totp/setup",
        json={"current_password": "wrong password"},
        headers={"X-CSRF-Token": csrf},
    )
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Current password is incorrect"
    assert user.totp_secret_encrypted is None
    assert user.totp_enrollment_expires_at is None


def test_totp_setup_accepts_current_password_and_keeps_email_mfa(totp_client) -> None:
    client, user, csrf = totp_client
    user.email_mfa_enabled = True
    user.email_mfa_verified_at = datetime.now(UTC).replace(tzinfo=None)

    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )

    assert setup.status_code == 200
    assert setup.headers["Cache-Control"] == "no-store, private"
    assert setup.json()["secret"]
    assert user.totp_secret_encrypted is not None
    assert user.totp_enrollment_expires_at is not None
    assert user.email_mfa_enabled is True
    assert user.email_mfa_verified_at is not None


def test_totp_confirm_rotates_session_revokes_others_and_csrf(totp_client, database_session) -> None:
    client, user, old_csrf = totp_client
    old_session_token = client.cookies.get("cartavault_session")
    assert old_session_token is not None
    old_current = database_session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(old_session_token))
    )
    assert old_current is not None
    extra = UserSession(
        user_id=user.id,
        token_hash="a" * 64,
        csrf_token_hash="b" * 64,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1),
        last_used_at=datetime.now(UTC).replace(tzinfo=None),
    )
    database_session.add(extra)
    database_session.flush()
    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": old_csrf},
    )
    code = pyotp.TOTP(setup.json()["secret"]).now()

    confirmed = client.post(
        "/account/security/totp/confirm",
        json={"code": code},
        headers={"X-CSRF-Token": old_csrf},
    )

    assert confirmed.status_code == 200
    assert len(confirmed.json()["recovery_codes"]) == 10
    new_csrf = confirmed.headers["X-CSRF-Token"]
    new_session_token = client.cookies.get("cartavault_session")
    assert new_csrf != old_csrf
    assert confirmed.cookies.get("cartavault_csrf") == new_csrf
    assert new_session_token is not None and new_session_token != old_session_token
    database_session.refresh(old_current)
    database_session.refresh(extra)
    assert old_current.revoked_at is not None
    assert extra.revoked_at is not None
    assert database_session.scalar(
        select(func.count()).select_from(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        )
    ) == 1
    assert database_session.scalar(
        select(UserSession.id).where(
            UserSession.token_hash == hash_token(new_session_token),
            UserSession.csrf_token_hash == hash_token(new_csrf),
            UserSession.revoked_at.is_(None),
        )
    ) is not None
    assert client.get(
        "/auth/me",
        headers={"Cookie": f"cartavault_session={old_session_token}; cartavault_csrf={old_csrf}"},
    ).status_code == 401
    assert client.post("/account/preferences/reset", headers={"X-CSRF-Token": old_csrf}).status_code == 403
    assert client.post("/account/preferences/reset", headers={"X-CSRF-Token": new_csrf}).status_code == 200

    repeated = client.post(
        "/account/security/totp/confirm",
        json={"code": code},
        headers={"X-CSRF-Token": new_csrf},
    )
    assert repeated.status_code == 400
    assert database_session.scalar(
        select(func.count()).select_from(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        )
    ) == 1


def test_totp_confirm_changes_email_mfa_only_after_valid_code(totp_client) -> None:
    client, user, csrf = totp_client
    verified_at = datetime.now(UTC).replace(tzinfo=None)
    user.email_mfa_enabled = True
    user.email_mfa_verified_at = verified_at
    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )

    invalid = client.post(
        "/account/security/totp/confirm",
        json={"code": "000000"},
        headers={"X-CSRF-Token": csrf},
    )
    assert invalid.status_code == 400
    assert user.totp_enabled is False
    assert user.email_mfa_enabled is True
    assert user.email_mfa_verified_at == verified_at

    code = pyotp.TOTP(setup.json()["secret"]).now()
    confirmed = client.post(
        "/account/security/totp/confirm",
        json={"code": code},
        headers={"X-CSRF-Token": csrf},
    )
    assert confirmed.status_code == 200
    assert user.totp_enabled is True
    assert user.email_mfa_enabled is False
    assert user.email_mfa_verified_at is None


def test_active_totp_cannot_be_replaced(totp_client, database_session) -> None:
    client, user, csrf = totp_client
    user.totp_enabled = True
    user.totp_secret_encrypted = "existing-encrypted-secret"
    user.totp_encryption_version = 1
    user.totp_verified_at = datetime.now(UTC).replace(tzinfo=None)
    recovery_code = TotpRecoveryCode(user_id=user.id, code_hash="c" * 64)
    database_session.add(recovery_code)
    database_session.flush()
    previous = (user.totp_secret_encrypted, user.totp_encryption_version, user.totp_verified_at)

    response = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 409
    assert (user.totp_secret_encrypted, user.totp_encryption_version, user.totp_verified_at) == previous
    assert database_session.get(TotpRecoveryCode, recovery_code.id) is recovery_code


def test_expired_totp_setup_cannot_be_confirmed(totp_client) -> None:
    client, user, csrf = totp_client
    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )
    user.totp_enrollment_expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)

    response = client.post(
        "/account/security/totp/confirm",
        json={"code": pyotp.TOTP(setup.json()["secret"]).now()},
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 400
    assert user.totp_enabled is False


def test_totp_setup_is_bound_to_its_user(totp_client, database_session) -> None:
    client, first_user, csrf = totp_client
    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )
    second_user = User(
        email="other-totp-user@example.test",
        display_name="Other TOTP user",
        password_hash="test-only",
        is_active=True,
        quota_profile_id=first_user.quota_profile_id,
    )
    database_session.add(second_user)
    database_session.flush()
    client.cookies.clear()
    login = client.post(
        "/auth/login",
        json={"email": second_user.email, "password": "current password"},
    )
    second_csrf = login.json()["csrf_token"]

    response = client.post(
        "/account/security/totp/confirm",
        json={"code": pyotp.TOTP(setup.json()["secret"]).now()},
        headers={"X-CSRF-Token": second_csrf},
    )

    assert response.status_code == 400
    assert first_user.totp_enabled is False
    assert second_user.totp_enabled is False


def test_totp_confirm_is_refused_after_logout_or_session_revocation(totp_client, database_session) -> None:
    client, _user, csrf = totp_client
    setup = client.post(
        "/account/security/totp/setup",
        json={"current_password": "current password"},
        headers={"X-CSRF-Token": csrf},
    )
    code = pyotp.TOTP(setup.json()["secret"]).now()
    assert client.post("/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.post(
        "/account/security/totp/confirm",
        json={"code": code},
        headers={"X-CSRF-Token": csrf},
    ).status_code == 401

    login = client.post(
        "/auth/login",
        json={"email": _user.email, "password": "current password"},
    )
    revoked_csrf = login.json()["csrf_token"]
    raw_session = client.cookies.get("cartavault_session")
    current = database_session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(raw_session))
    )
    assert current is not None
    current.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()
    assert client.post(
        "/account/security/totp/confirm",
        json={"code": code},
        headers={"X-CSRF-Token": revoked_csrf},
    ).status_code == 403
