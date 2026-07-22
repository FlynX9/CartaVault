from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.config import security_settings


class UserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None
    avatar_url: str | None = None
    quota_profile_id: UUID


class UserSelfRead(UserRead):
    csrf_token: str


class EmailModel(BaseModel):
    @field_validator("email", check_fields=False)
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip()
        if normalized.count("@") != 1 or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("A valid email address is required")
        return normalized


class UserAdminCreate(EmailModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=security_settings.password_min_length, max_length=1024)
    is_admin: bool = False
    is_active: bool = True
    quota_profile_id: UUID | None = None


class UserAdminUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    is_admin: bool | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def reject_nulls(self) -> Self:
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=security_settings.password_min_length, max_length=1024)


class AccountProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or "<" in cleaned or ">" in cleaned:
            raise ValueError("A plain display name is required")
        return cleaned


class EmailChange(EmailModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_email: str = Field(min_length=3, max_length=320)

    @field_validator("new_email")
    @classmethod
    def clean_new_email(cls, value: str) -> str:
        normalized = value.strip()
        if normalized.count("@") != 1 or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("A valid email address is required")
        return normalized


class AccountPasswordChange(PasswordChange):
    confirmation: str = Field(min_length=security_settings.password_min_length, max_length=1024)

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        if self.new_password != self.confirmation:
            raise ValueError("Password confirmation does not match")
        if self.new_password == self.current_password:
            raise ValueError("The new password must be different")
        return self


class AccountDelete(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    confirmation: str
    acknowledged: bool

    @model_validator(mode="after")
    def validate_confirmation(self) -> Self:
        if self.confirmation != "SUPPRIMER MON COMPTE" or not self.acknowledged:
            raise ValueError("Account deletion confirmation is invalid")
        return self


class RoutingPreferences(BaseModel):
    provider: Literal["osrm", "google"] = "osrm"
    stay_in_country: bool = False
    avoid_tolls: bool = False
    avoid_highways: bool = False
    avoid_ferries: bool = False
    traffic_mode: Literal["traffic_unaware", "traffic_aware", "traffic_aware_optimal"] = "traffic_unaware"


class AccountPreferences(BaseModel):
    preferred_basemap: Literal["cartavault-light", "cartavault-dark", "satellite", "osm"] = "cartavault-light"
    density: Literal["comfortable", "compact"] = "comfortable"
    startup_panel: Literal["maps", "places", "last"] = "maps"
    timezone: str = Field(default="Europe/Paris", min_length=1, max_length=64)
    routing: RoutingPreferences = Field(default_factory=RoutingPreferences)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_routing_preference(cls, value: object) -> object:
        if not isinstance(value, dict) or "routing" in value or "keep_routes_in_country" not in value:
            return value
        migrated = dict(value)
        migrated["routing"] = {"stay_in_country": migrated.pop("keep_routes_in_country")}
        return migrated


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=security_settings.password_min_length, max_length=1024)


class LoginRequest(EmailModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class RegistrationCreate(EmailModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=security_settings.password_min_length, max_length=1024)
    confirmation: str = Field(min_length=security_settings.password_min_length, max_length=1024)

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        if self.password != self.confirmation:
            raise ValueError("Password confirmation does not match")
        return self


class PasswordResetRequest(EmailModel):
    email: str = Field(min_length=3, max_length=320)


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    password: str = Field(min_length=security_settings.password_min_length, max_length=1024)
    confirmation: str = Field(min_length=security_settings.password_min_length, max_length=1024)

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        if self.password != self.confirmation:
            raise ValueError("Password confirmation does not match")
        return self


class RegistrationRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime
    reviewed_at: datetime | None
    notification_sent_at: datetime | None
    notification_error_code: str | None
