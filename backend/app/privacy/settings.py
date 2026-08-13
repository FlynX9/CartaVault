from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.admin.models import SystemSetting


SETTING_KEY = "privacy"
CONSENT_VERSION = "1"


@dataclass(frozen=True)
class PrivacySettings:
    """Deployment-owned privacy configuration.

    Optional analytics are deliberately disabled by default.  A self-hosted
    instance therefore never needs a consent banner unless its administrator
    explicitly enables a consent-requiring integration.
    """

    analytics_mode: str = "disabled"
    operator_name: str = ""
    privacy_policy_url: str = ""
    cookie_policy_url: str = ""
    contact_email: str = ""
    policy_version: str = "1"
    auth_log_retention_days: int = 90
    session_retention_days: int = 30
    deleted_account_retention_days: int = 0

    @property
    def consent_required(self) -> bool:
        return self.analytics_mode == "consent_required"


def _normalized(value: object) -> PrivacySettings:
    source = value if isinstance(value, dict) else {}
    mode = str(source.get("analytics_mode", "disabled"))
    if mode not in {"disabled", "privacy_preserving", "consent_required"}:
        mode = "disabled"

    def text(key: str, maximum: int) -> str:
        return str(source.get(key, "")).strip()[:maximum]

    def days(key: str, default: int, minimum: int, maximum: int) -> int:
        try:
            return min(maximum, max(minimum, int(source.get(key, default))))
        except (TypeError, ValueError):
            return default

    return PrivacySettings(
        analytics_mode=mode,
        operator_name=text("operator_name", 160),
        privacy_policy_url=text("privacy_policy_url", 2048),
        cookie_policy_url=text("cookie_policy_url", 2048),
        contact_email=text("contact_email", 320),
        policy_version=text("policy_version", 32) or "1",
        auth_log_retention_days=days("auth_log_retention_days", 90, 1, 3650),
        session_retention_days=days("session_retention_days", 30, 1, 365),
        deleted_account_retention_days=days("deleted_account_retention_days", 0, 0, 3650),
    )


def get_privacy_settings(session: Session) -> PrivacySettings:
    setting = session.get(SystemSetting, SETTING_KEY)
    return _normalized(setting.value if setting else {})


def save_privacy_settings(session: Session, settings: PrivacySettings) -> PrivacySettings:
    value = {
        "analytics_mode": settings.analytics_mode,
        "operator_name": settings.operator_name,
        "privacy_policy_url": settings.privacy_policy_url,
        "cookie_policy_url": settings.cookie_policy_url,
        "contact_email": settings.contact_email,
        "policy_version": settings.policy_version,
        "auth_log_retention_days": settings.auth_log_retention_days,
        "session_retention_days": settings.session_retention_days,
        "deleted_account_retention_days": settings.deleted_account_retention_days,
    }
    setting = session.get(SystemSetting, SETTING_KEY)
    if setting is None:
        session.add(SystemSetting(key=SETTING_KEY, value=value))
    else:
        setting.value = value
    session.commit()
    return settings
