from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PrivacySettingsRead(BaseModel):
    analytics_mode: Literal["disabled", "privacy_preserving", "consent_required"]
    consent_required: bool
    consent_version: str
    operator_name: str
    privacy_policy_url: str
    cookie_policy_url: str
    contact_email: str
    policy_version: str
    auth_log_retention_days: int
    session_retention_days: int
    deleted_account_retention_days: int


class PrivacySettingsUpdate(BaseModel):
    analytics_mode: Literal["disabled", "privacy_preserving", "consent_required"] = "disabled"
    operator_name: str = Field(default="", max_length=160)
    privacy_policy_url: str = Field(default="", max_length=2048)
    cookie_policy_url: str = Field(default="", max_length=2048)
    contact_email: str = Field(default="", max_length=320)
    policy_version: str = Field(default="1", min_length=1, max_length=32)
    auth_log_retention_days: int = Field(default=90, ge=1, le=3650)
    session_retention_days: int = Field(default=30, ge=1, le=365)
    deleted_account_retention_days: int = Field(default=0, ge=0, le=3650)

    @field_validator("privacy_policy_url", "cookie_policy_url")
    @classmethod
    def validate_optional_url(cls, value: str) -> str:
        normalized = value.strip()
        if normalized and not normalized.startswith(("https://", "http://")):
            raise ValueError("A policy URL must use HTTP(S)")
        return normalized


class ConsentPreferences(BaseModel):
    analytics: bool = False
    functional_optional: bool = False
    marketing: bool = False
    third_party: bool = False


class ConsentRead(ConsentPreferences):
    necessary: Literal[True] = True
    version: str
    updated_at: datetime | None = None
