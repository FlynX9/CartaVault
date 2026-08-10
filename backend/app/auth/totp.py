"""TOTP primitives and storage helpers.

Secrets only cross this module while an authenticated user actively enrols.
They are encrypted at rest with CartaVault's established credential key.
"""

from __future__ import annotations

import base64
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import pyotp
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionService
from app.auth.models import TotpRecoveryCode, User
from app.auth.security import hash_token

ISSUER = "CartaVault"
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
ENROLLMENT_TTL_MINUTES = 15
RECOVERY_CODE_COUNT = 10


def now_utc() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    label = quote(f"{ISSUER}:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&digits={TOTP_DIGITS}&period={TOTP_PERIOD_SECONDS}"


def decrypt_secret(user: User) -> str | None:
    if not user.totp_secret_encrypted or user.totp_encryption_version is None:
        return None
    return CredentialEncryptionService.from_settings().decrypt(user.totp_secret_encrypted, user.totp_encryption_version)


def verify_code(user: User, code: str, *, reject_replay: bool = False) -> bool:
    secret = decrypt_secret(user)
    if secret is None:
        return False
    normalized = "".join(code.split())
    if len(normalized) != TOTP_DIGITS or not normalized.isdigit():
        return False
    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS)
    if not totp.verify(normalized, valid_window=1):
        return False
    if reject_replay:
        counter = int(datetime.now(UTC).timestamp() // TOTP_PERIOD_SECONDS)
        if user.totp_last_used_counter == counter:
            return False
        user.totp_last_used_counter = counter
    return True


def recovery_code() -> str:
    raw = base64.b32encode(secrets.token_bytes(10)).decode("ascii").rstrip("=")
    return f"{raw[:5]}-{raw[5:10]}-{raw[10:]}"


def normalize_recovery_code(value: str) -> str:
    return "".join(character for character in value.upper() if character.isalnum())


def regenerate_recovery_codes(session: Session, user: User) -> list[str]:
    session.execute(delete(TotpRecoveryCode).where(TotpRecoveryCode.user_id == user.id))
    values = [recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    session.add_all(TotpRecoveryCode(user_id=user.id, code_hash=hash_token(normalize_recovery_code(value))) for value in values)
    return values


def consume_recovery_code(session: Session, user: User, code: str) -> bool:
    row = session.scalar(
        select(TotpRecoveryCode)
        .where(TotpRecoveryCode.user_id == user.id, TotpRecoveryCode.code_hash == hash_token(normalize_recovery_code(code)), TotpRecoveryCode.used_at.is_(None))
        .with_for_update()
    )
    if row is None:
        return False
    row.used_at = now_utc()
    return True


def clear_totp(session: Session, user: User) -> None:
    session.execute(delete(TotpRecoveryCode).where(TotpRecoveryCode.user_id == user.id))
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    user.totp_encryption_version = None
    user.totp_verified_at = None
    user.totp_enrollment_expires_at = None
    user.totp_last_used_counter = None


def enroll_secret(user: User, secret: str) -> None:
    encrypted = CredentialEncryptionService.from_settings().encrypt(secret)
    user.totp_enabled = False
    user.totp_secret_encrypted = encrypted.ciphertext
    user.totp_encryption_version = encrypted.version
    user.totp_verified_at = None
    user.totp_last_used_counter = None
    user.totp_enrollment_expires_at = now_utc() + timedelta(minutes=ENROLLMENT_TTL_MINUTES)
