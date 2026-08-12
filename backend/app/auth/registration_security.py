from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth.activity import record_user_activity
from app.auth.models import AuthSecurityEvent, RegistrationRequest
from app.config import security_settings


CURRENT_TERMS_VERSION = "2026-08"
COMMON_PASSWORDS = {
    "123456789012",
    "azertyuiop12",
    "password1234",
    "motdepasse123",
    "cartavault123",
}


def validate_registration_password(password: str, email: str) -> None:
    """Apply a predictable policy without imposing arbitrary character classes."""

    normalized = password.casefold()
    local_part = email.split("@", 1)[0].casefold()
    if normalized in COMMON_PASSWORDS or len(set(normalized)) < 6:
        raise HTTPException(422, "Le mot de passe est trop facile à deviner.")
    if len(local_part) >= 4 and local_part in normalized:
        raise HTTPException(422, "Le mot de passe ne doit pas contenir votre adresse email.")


def opaque_hash(value: str | None) -> str | None:
    return sha256(value.encode("utf-8")).hexdigest() if value else None


def record_auth_event(
    session: Session,
    event_type: str,
    outcome: str,
    *,
    email: str | None = None,
    client_ip: str | None = None,
    request: RegistrationRequest | None = None,
    actor_user_id: object | None = None,
    details: dict[str, object] | None = None,
) -> None:
    session.add(AuthSecurityEvent(
        event_type=event_type,
        outcome=outcome,
        actor_user_id=actor_user_id,
        registration_request_id=request.id if request else None,
        target_email_hash=opaque_hash(email),
        client_ip_hash=opaque_hash(client_ip),
        details=details or {},
    ))
    # The administrative timeline is intentionally concise: only successful
    # actions belonging to an identified account are mirrored there.
    if outcome in {"accepted", "verified", "approved", "auto_approved"} and actor_user_id is not None:
        record_user_activity(
            session,
            user_id=actor_user_id,
            actor_user_id=actor_user_id,
            event_type=event_type.replace(".", "_"),
        )


def expire_stale_registration_requests(session: Session) -> int:
    now = datetime.now(UTC).replace(tzinfo=None)
    retention_cutoff = now - timedelta(days=security_settings.registration_retention_days)
    result = session.execute(
        update(RegistrationRequest)
        .where(
            RegistrationRequest.status.in_(("awaiting_email", "pending")),
            (
                ((RegistrationRequest.status == "awaiting_email") & (RegistrationRequest.verification_expires_at < now))
                | (RegistrationRequest.created_at < retention_cutoff)
            ),
        )
        .values(status="expired", verification_token_hash=None)
    )
    return int(result.rowcount or 0)
