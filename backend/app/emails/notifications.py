"""Best-effort transactional notifications sent after durable account writes."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.auth.models import User
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database


logger = logging.getLogger(__name__)
EXPECTED_DISABLED_CODES = {"EMAIL_DELIVERY_DISABLED", "EMAIL_PROVIDER_NOT_CONFIGURED"}


def _locale(user: User) -> str:
    return str((user.preferences or {}).get("language") or "fr")


def _delivery_failed(event: str, user_id: object, error: EmailDeliveryError) -> None:
    log = logger.info if error.code in EXPECTED_DISABLED_CODES else logger.warning
    log("transactional_email_failed event=%s user_id=%s code=%s", event, user_id, error.code)


def notify_password_changed(database_session: Session, user: User) -> None:
    """Notify the account after its password transaction has committed."""

    try:
        EmailService(provider_from_database(database_session)).notify_password_changed(
            user.email,
            user.display_name,
            _locale(user),
        )
    except EmailDeliveryError as error:
        _delivery_failed("password_changed", user.id, error)


def notify_email_changed(database_session: Session, user: User, old_email: str) -> None:
    """Notify both the previous and current addresses after a committed change."""

    try:
        service = EmailService(provider_from_database(database_session))
    except EmailDeliveryError as error:
        _delivery_failed("email_changed", user.id, error)
        return

    for recipient in dict.fromkeys((old_email, user.email)):
        try:
            service.notify_email_changed(
                recipient,
                user.display_name,
                old_email,
                user.email,
                _locale(user),
            )
        except EmailDeliveryError as error:
            _delivery_failed("email_changed", user.id, error)
