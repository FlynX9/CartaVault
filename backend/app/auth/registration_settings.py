from __future__ import annotations

from sqlalchemy.orm import Session

from app.admin.models import SystemSetting


PUBLIC_REGISTRATION_SETTING_KEY = "instance"


def public_registration_enabled(session: Session) -> bool:
    """Return whether visitors may create a registration request."""
    setting = session.get(SystemSetting, PUBLIC_REGISTRATION_SETTING_KEY)
    return bool(setting and (setting.value or {}).get("public_registration_enabled") is True)


def registration_approval_required(session: Session) -> bool:
    """Return whether verified public registrations require administrator review.

    Existing instances used manual approval unconditionally, therefore an absent
    setting deliberately keeps that safe, historical behaviour.
    """
    setting = session.get(SystemSetting, PUBLIC_REGISTRATION_SETTING_KEY)
    return not bool(setting and (setting.value or {}).get("public_registration_approval_required") is False)


def update_public_registration_settings(session: Session, *, enabled: bool, approval_required: bool) -> tuple[bool, bool]:
    """Persist both public-signup settings in one instance-setting update.

    A newly bootstrapped instance may not have an ``instance`` row yet.  Keeping
    both values in the same write prevents two pending rows with the same
    primary key from being added during one request.
    """
    setting = session.get(SystemSetting, PUBLIC_REGISTRATION_SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(
            key=PUBLIC_REGISTRATION_SETTING_KEY,
            value={
                "public_registration_enabled": enabled,
                "public_registration_approval_required": approval_required,
            },
        ))
    else:
        setting.value = {
            **(setting.value or {}),
            "public_registration_enabled": enabled,
            "public_registration_approval_required": approval_required,
        }
    return enabled, approval_required
