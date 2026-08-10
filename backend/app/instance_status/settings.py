from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.instance_status.models import InstanceLog

LOG_RETENTION_SETTING_KEY = "instance_log_retention"
DEFAULT_LOG_RETENTION_DAYS = 7
MIN_LOG_RETENTION_DAYS = 1
MAX_LOG_RETENTION_DAYS = 365


def get_log_retention_days(session: Session) -> int:
    setting = session.get(SystemSetting, LOG_RETENTION_SETTING_KEY)
    try:
        value = int((setting.value or {}).get("days", DEFAULT_LOG_RETENTION_DAYS)) if setting else DEFAULT_LOG_RETENTION_DAYS
    except (TypeError, ValueError):
        value = DEFAULT_LOG_RETENTION_DAYS
    return min(MAX_LOG_RETENTION_DAYS, max(MIN_LOG_RETENTION_DAYS, value))


def set_log_retention_days(session: Session, days: int) -> int:
    normalized = min(MAX_LOG_RETENTION_DAYS, max(MIN_LOG_RETENTION_DAYS, int(days)))
    setting = session.get(SystemSetting, LOG_RETENTION_SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(key=LOG_RETENTION_SETTING_KEY, value={"days": normalized}))
    else:
        setting.value = {**(setting.value or {}), "days": normalized}
    session.commit()
    purge_expired_logs(session, normalized)
    return normalized


def purge_expired_logs(session: Session, retention_days: int | None = None) -> int:
    days = retention_days if retention_days is not None else get_log_retention_days(session)
    threshold = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
    result = session.execute(delete(InstanceLog).where(InstanceLog.timestamp < threshold))
    session.commit()
    return int(result.rowcount or 0)
