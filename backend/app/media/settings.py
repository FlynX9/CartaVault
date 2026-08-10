from sqlalchemy.orm import Session

from app.admin.models import SystemSetting

DEFAULT_MAX_UPLOAD_MEGABYTES = 5
MIN_MAX_UPLOAD_MEGABYTES = 1
MAX_MAX_UPLOAD_MEGABYTES = 100


def get_max_upload_megabytes(session: Session) -> int:
    setting = session.get(SystemSetting, "media_upload")
    value = (setting.value or {}).get("max_upload_megabytes") if setting else None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_MAX_UPLOAD_MEGABYTES
    return min(MAX_MAX_UPLOAD_MEGABYTES, max(MIN_MAX_UPLOAD_MEGABYTES, parsed))


def set_max_upload_megabytes(session: Session, value: int) -> int:
    normalized = min(MAX_MAX_UPLOAD_MEGABYTES, max(MIN_MAX_UPLOAD_MEGABYTES, int(value)))
    setting = session.get(SystemSetting, "media_upload")
    if setting is None:
        setting = SystemSetting(key="media_upload", value={"max_upload_megabytes": normalized})
        session.add(setting)
    else:
        setting.value = {**(setting.value or {}), "max_upload_megabytes": normalized}
    session.commit()
    return normalized
