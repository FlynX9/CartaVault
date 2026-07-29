from __future__ import annotations

from sqlalchemy.orm import Session

from app.admin.models import SystemSetting


PUBLIC_REGISTRATION_SETTING_KEY = "instance"


def public_registration_enabled(session: Session) -> bool:
    """Return whether visitors may create a registration request."""
    setting = session.get(SystemSetting, PUBLIC_REGISTRATION_SETTING_KEY)
    return bool(setting and (setting.value or {}).get("public_registration_enabled") is True)


def set_public_registration_enabled(session: Session, enabled: bool) -> bool:
    setting = session.get(SystemSetting, PUBLIC_REGISTRATION_SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(key=PUBLIC_REGISTRATION_SETTING_KEY, value={"public_registration_enabled": enabled}))
    else:
        setting.value = {**(setting.value or {}), "public_registration_enabled": enabled}
    return enabled
