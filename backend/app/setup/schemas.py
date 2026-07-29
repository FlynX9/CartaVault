from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


class SetupCheck(BaseModel):
    key: str
    label: str
    status: Literal["ready", "warning", "error"]
    detail: str


class SetupStatus(BaseModel):
    required: bool
    locked: bool
    checks: list[SetupCheck]


class SetupTokenVerification(BaseModel):
    valid: bool


class SetupAdministrator(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=512)
    password_confirmation: str = Field(min_length=12, max_length=512)
    language: Literal["en", "fr"] = "en"
    timezone: str = Field(default="UTC", min_length=1, max_length=64)

    @model_validator(mode="after")
    def matching_passwords(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match")
        return self


class SetupInstanceSettings(BaseModel):
    instance_name: str = Field(default="CartaVault", min_length=1, max_length=120)
    public_url: HttpUrl
    default_language: Literal["en", "fr"] = "en"
    timezone: str = Field(default="UTC", min_length=1, max_length=64)
    public_registration_enabled: bool = False
    maximum_upload_megabytes: int = Field(default=10, ge=1, le=500)
    support_address: str | None = Field(default=None, max_length=320)


class SetupEmailSettings(BaseModel):
    provider: Literal["none", "resend"] = "none"
    api_key: str | None = Field(default=None, max_length=512)
    sender_address: str | None = Field(default=None, max_length=320)
    sender_name: str = Field(default="CartaVault", min_length=1, max_length=120)
    reply_to_address: str | None = Field(default=None, max_length=320)

    @model_validator(mode="after")
    def validate_resend(self):
        if self.provider == "resend":
            if not self.api_key or not self.api_key.startswith("re_"):
                raise ValueError("A valid Resend API key is required")
            if not self.sender_address:
                raise ValueError("A sender address is required")
        return self


class SetupMappingSettings(BaseModel):
    default_basemap: Literal[
        "cartavault-light",
        "cartavault-dark",
        "osm-standard",
        "satellite",
    ] = "cartavault-light"
    default_routing_engine: Literal["osrm", "google_routes"] = "osrm"


class SetupCompletion(BaseModel):
    administrator: SetupAdministrator
    instance: SetupInstanceSettings
    email: SetupEmailSettings = Field(default_factory=SetupEmailSettings)
    mapping: SetupMappingSettings = Field(default_factory=SetupMappingSettings)


class SetupCompletionResult(BaseModel):
    completed: bool
    administrator_email: str
