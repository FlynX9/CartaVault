from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


QuotaKey = Literal["maps", "places", "photo_storage_bytes", "photo_file_bytes", "members_per_map"]


class AdminUserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: Literal["admin", "user"]
    state: Literal["active", "inactive", "deleted"]
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None
    owned_map_count: int
    shared_map_count: int


class AdminUserPage(BaseModel):
    items: list[AdminUserRead]
    total: int
    page: int
    page_size: int
    pages: int


class AdminUserUpdate(BaseModel):
    role: Literal["admin", "user"] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_change(self):
        if self.role is None and self.is_active is None:
            raise ValueError("At least one administrative change is required")
        return self


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


class QuotaLimits(BaseModel):
    maps: int | None = Field(default=None, ge=1)
    places: int | None = Field(default=None, ge=1)
    photo_storage_bytes: int | None = Field(default=None, ge=1)
    photo_file_bytes: int | None = Field(default=None, ge=1)
    members_per_map: int | None = Field(default=None, ge=1)


class QuotaUsage(BaseModel):
    maps: int
    places: int
    photos: int
    photo_storage_bytes: int | None
    memberships: int
    imports: int | None = None
    exports: int | None = None
    route_calculations: int | None = None
    google_routes_requests: int | None = None


class UserQuotaRead(BaseModel):
    user_id: UUID
    display_name: str
    email: str
    limits: QuotaLimits
    overrides: QuotaLimits
    usage: QuotaUsage


class QuotaOverview(BaseModel):
    global_limits: QuotaLimits
    aggregate_usage: QuotaUsage
    users: list[UserQuotaRead]
    unavailable_metrics: list[str]


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

