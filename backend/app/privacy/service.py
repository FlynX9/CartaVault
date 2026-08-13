from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from app.auth.models import AuthActionToken, AuthSecurityEvent, EmailMfaCode, UserSession
from app.privacy.settings import PrivacySettings


def purge_expired_privacy_artifacts(session: Session, settings: PrivacySettings) -> None:
    """Remove expired security artifacts on the centralized maintenance schedule.

    Account deletion already anonymizes a record following a confirmed,
    re-authenticated request.  We intentionally do not physically delete the
    anonymized row here: maps, invitations and audit rows retain relational
    references and must never be broken by an automatic retention task.
    """

    now = datetime.now(UTC).replace(tzinfo=None)
    session.execute(delete(UserSession).where(or_(
        UserSession.expires_at <= now,
        UserSession.created_at < now - timedelta(days=settings.session_retention_days),
    )))
    session.execute(delete(AuthActionToken).where(AuthActionToken.expires_at <= now))
    session.execute(delete(EmailMfaCode).where(EmailMfaCode.expires_at <= now))
    session.execute(delete(AuthSecurityEvent).where(
        AuthSecurityEvent.occurred_at < now - timedelta(days=settings.auth_log_retention_days)
    ))
    session.commit()
