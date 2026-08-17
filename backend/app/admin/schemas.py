from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PublicRegistrationSettings(BaseModel):
    enabled: bool
    approval_required: bool = True


class AdminUserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    role: Literal["admin", "user"]
    state: Literal["active", "inactive", "deleted"]
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None
    owned_map_count: int
    shared_map_count: int
    place_count: int
    quota_profile_id: UUID
    quota_profile_name: str


class AdminUserSummary(BaseModel):
    active_users: int
    administrators: int
    maps: int
    places: int


class AdminUserPage(BaseModel):
    items: list[AdminUserRead]
    total: int
    page: int
    page_size: int
    pages: int
    summary: AdminUserSummary


class AdminUserUpdate(BaseModel):
    role: Literal["admin", "user"] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.role is None and self.is_active is None:
            raise ValueError("At least one administrative change is required")
        return self


class AdminUserDetails(AdminUserRead):
    trip_count: int
    active_session_count: int
    email_verified: bool
    mfa_enabled: bool


class AdminUserActivityRead(BaseModel):
    id: UUID
    event_type: str
    previous_value: str | None = None
    next_value: str | None = None
    occurred_at: datetime
    actor_display_name: str | None = None


class CredentialStatus(BaseModel):
    provider: str
    label: str
    scope: Literal["instance", "personal", "infrastructure"]
    configured: bool
    editable: bool
    source: Literal["database", "environment", "deployment", "none"]
    masked_value: str | None = None
    verified_at: datetime | None = None
    last_used_at: datetime | None = None
    last_error_code: str | None = None
    configured_user_count: int | None = None


class CredentialValue(BaseModel):
    value: str = Field(min_length=3, max_length=512)


class AdminApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: Literal["google", "stadia", "mapbox", "openrouteservice", "resend"]
    api_key: str = Field(min_length=1, max_length=512)
    capabilities: list[Literal["routing", "places_search", "classic_basemap", "satellite_basemap"]] | None = None


class AdminApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    api_key: str | None = Field(default=None, min_length=1, max_length=512)
    capabilities: list[Literal["routing", "places_search", "classic_basemap", "satellite_basemap"]] | None = None


class MediaUploadSettings(BaseModel):
    max_upload_megabytes: int = Field(default=5, ge=1, le=100)
    max_image_dimension: int = Field(default=2560, ge=1024, le=7680)


class InstanceLogRetentionSettings(BaseModel):
    retention_days: int = Field(default=7, ge=1, le=365)


class SaasSettings(BaseModel):
    enabled: bool = False


class ServiceHealth(BaseModel):
    status: Literal["ok", "warning", "unavailable"]
    detail: str
    version: str | None = None


class InstanceCounts(BaseModel):
    users: int
    maps: int
    places: int
    photos: int


class InstanceHealth(BaseModel):
    application_version: str
    checked_at: datetime
    database_revision: str | None
    database: ServiceHealth
    postgis: ServiceHealth
    storage: ServiceHealth
    disk_total_bytes: int | None
    disk_free_bytes: int | None
    credential_encryption: ServiceHealth
    osrm: ServiceHealth
    email: ServiceHealth
    recent_errors: ServiceHealth
    counts: InstanceCounts
