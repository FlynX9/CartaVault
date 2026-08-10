from sqlalchemy.orm import Session

from app.admin.models import SystemSetting


SETTING_KEY = "saas"


def saas_enabled(session: Session) -> bool:
    setting = session.get(SystemSetting, SETTING_KEY)
    return bool((setting.value or {}).get("enabled", False)) if setting else False


def set_saas_enabled(session: Session, enabled: bool) -> bool:
    setting = session.get(SystemSetting, SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(key=SETTING_KEY, value={"enabled": enabled}))
    else:
        setting.value = {**(setting.value or {}), "enabled": enabled}
    session.commit()
    return enabled
