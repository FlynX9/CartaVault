from __future__ import annotations

import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.models import User
from app.auth.security import hash_token
from app.config import credential_settings, security_settings
from app.photos.storage import get_photo_storage_root
from app.setup.schemas import SetupCheck


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def setup_token() -> str:
    return os.getenv("CARTAVAULT_SETUP_TOKEN", "").strip()


def setup_is_locked(session: Session) -> bool:
    completed = session.get(SystemSetting, "setup.completed")
    if completed is not None and completed.value.get("completed") is True:
        return True
    return bool(
        session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.is_admin.is_(True), User.is_active.is_(True))
        )
    )


def verify_setup_token(candidate: str) -> bool:
    configured = setup_token()
    if not configured or not candidate:
        return False
    return secrets.compare_digest(hash_token(candidate), hash_token(configured))


def technical_checks(session: Session) -> list[SetupCheck]:
    checks: list[SetupCheck] = []
    try:
        session.scalar(text("SELECT 1"))
        checks.append(SetupCheck(key="database", label="Database", status="ready", detail="PostgreSQL is reachable."))
    except Exception:
        checks.append(SetupCheck(key="database", label="Database", status="error", detail="PostgreSQL is unavailable."))
        return checks

    try:
        postgis = session.scalar(text("SELECT PostGIS_Version()"))
        checks.append(SetupCheck(
            key="postgis",
            label="PostGIS",
            status="ready" if postgis else "error",
            detail=f"PostGIS {postgis} is available." if postgis else "PostGIS is unavailable.",
        ))
    except Exception:
        checks.append(SetupCheck(key="postgis", label="PostGIS", status="error", detail="PostGIS is unavailable."))

    try:
        current_heads = set(session.scalars(text("SELECT version_num FROM alembic_version")))
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        expected_heads = set(ScriptDirectory.from_config(config).get_heads())
        current = current_heads == expected_heads
        checks.append(SetupCheck(
            key="schema",
            label="Schema",
            status="ready" if current else "error",
            detail="Database migrations are up to date." if current else "Database migrations are incomplete.",
        ))
    except Exception:
        checks.append(SetupCheck(key="schema", label="Schema", status="error", detail="Migration state cannot be verified."))

    storage_root = get_photo_storage_root()
    storage_ready = storage_root.exists() and os.access(storage_root, os.W_OK)
    checks.append(SetupCheck(
        key="storage",
        label="Photo storage",
        status="ready" if storage_ready else "error",
        detail="Photo storage is writable." if storage_ready else "Photo storage is not writable.",
    ))

    public_url = (
        os.getenv("CARTAVAULT_PUBLIC_URL")
        or os.getenv("FRONTEND_PUBLIC_URL")
        or ""
    ).strip()
    parsed = urlsplit(public_url)
    checks.append(SetupCheck(
        key="public_url",
        label="Public URL",
        status="ready" if parsed.scheme in {"http", "https"} and parsed.netloc else "error",
        detail=public_url if public_url else "No public URL is configured.",
    ))
    checks.append(SetupCheck(
        key="https",
        label="HTTPS",
        status="ready" if parsed.scheme == "https" else "warning",
        detail="HTTPS is configured." if parsed.scheme == "https" else "HTTPS is not detected; use it before public exposure.",
    ))
    checks.append(SetupCheck(
        key="secure_cookie",
        label="Secure cookies",
        status="ready" if security_settings.cookie_secure else "warning",
        detail="Secure cookies are enabled." if security_settings.cookie_secure else "Secure cookies are disabled.",
    ))
    checks.append(SetupCheck(
        key="session_secret",
        label="Session key",
        status="ready" if os.getenv("CARTAVAULT_SESSION_SECRET", "").strip() else "warning",
        detail="Session key is configured." if os.getenv("CARTAVAULT_SESSION_SECRET", "").strip() else "No dedicated session key is configured.",
    ))
    checks.append(SetupCheck(
        key="encryption_key",
        label="Encryption key",
        status="ready" if credential_settings.encryption_key else "error",
        detail="Credential encryption is configured." if credential_settings.encryption_key else "Credential encryption is not configured.",
    ))
    checks.append(SetupCheck(
        key="setup_token",
        label="Setup token",
        status="ready" if setup_token() else "error",
        detail="Initial setup is protected." if setup_token() else "No setup token is configured.",
    ))
    try:
        database_permissions = bool(session.scalar(text(
            "SELECT has_schema_privilege(current_user, current_schema(), 'CREATE')"
        )))
    except Exception:
        database_permissions = False
    checks.append(SetupCheck(
        key="database_permissions",
        label="Database permissions",
        status="ready" if database_permissions else "error",
        detail="Schema migration permissions are available." if database_permissions else "The database user cannot alter the application schema.",
    ))
    return checks
