from __future__ import annotations

import hashlib
import secrets
from typing import Any

from app.config import security_settings


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def _password_hasher() -> Any:
    try:
        from argon2 import PasswordHasher
        from argon2.low_level import Type
    except ImportError as error:
        raise RuntimeError("argon2-cffi is required; install backend/requirements.txt") from error
    return PasswordHasher(
        time_cost=security_settings.argon2_time_cost,
        memory_cost=security_settings.argon2_memory_cost,
        parallelism=security_settings.argon2_parallelism,
        hash_len=32,
        salt_len=16,
        type=Type.ID,
    )


def hash_password(password: str) -> str:
    return _password_hasher().hash(password)


def verify_password(password_hash: str, password: str) -> tuple[bool, bool]:
    try:
        from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
        hasher = _password_hasher()
        valid = hasher.verify(password_hash, password)
        return valid, valid and hasher.check_needs_rehash(password_hash)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False, False


def generate_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(raw_token: str, expected_hash: str) -> bool:
    return secrets.compare_digest(hash_token(raw_token), expected_hash)
