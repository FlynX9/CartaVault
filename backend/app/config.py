from __future__ import annotations

import os
from dataclasses import dataclass


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = int(raw)
    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer")
    return value


def _boolean(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SecuritySettings:
    session_cookie_name: str = os.getenv("CARTAVAULT_SESSION_COOKIE_NAME", "cartavault_session")
    csrf_cookie_name: str = os.getenv("CARTAVAULT_CSRF_COOKIE_NAME", "cartavault_csrf")
    session_days: int = _positive_int("CARTAVAULT_SESSION_DAYS", 14)
    invitation_hours: int = _positive_int("CARTAVAULT_INVITATION_HOURS", 168)
    cookie_secure: bool = _boolean("CARTAVAULT_COOKIE_SECURE", False)
    password_min_length: int = _positive_int("CARTAVAULT_PASSWORD_MIN_LENGTH", 12)
    argon2_time_cost: int = _positive_int("CARTAVAULT_ARGON2_TIME_COST", 3)
    argon2_memory_cost: int = _positive_int("CARTAVAULT_ARGON2_MEMORY_COST", 65536)
    argon2_parallelism: int = _positive_int("CARTAVAULT_ARGON2_PARALLELISM", 4)


security_settings = SecuritySettings()
