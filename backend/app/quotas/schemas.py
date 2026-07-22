from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.quotas.registry import QUOTA_REGISTRY, QuotaKey, QuotaScope


class QuotaLimits(BaseModel):
    maps_max: int | None = Field(default=None, ge=0)
    trips_total_max: int | None = Field(default=None, ge=0)
    storage_bytes_max: int | None = Field(default=None, ge=0)
    photos_total_max: int | None = Field(default=None, ge=0)
    memberships_total_max: int | None = Field(default=None, ge=0)
    pending_invitations_max: int | None = Field(default=None, ge=0)
    places_per_map_max: int | None = Field(default=None, ge=0)
    tags_per_map_max: int | None = Field(default=None, ge=0)
    categories_per_map_max: int | None = Field(default=None, ge=0)
    statuses_per_map_max: int | None = Field(default=None, ge=0)
    trips_per_map_max: int | None = Field(default=None, ge=0)
    members_per_map_max: int | None = Field(default=None, ge=0)
    pending_invitations_per_map_max: int | None = Field(default=None, ge=0)
    photos_per_place_max: int | None = Field(default=None, ge=0)
    links_per_place_max: int | None = Field(default=None, ge=0)
    days_per_trip_max: int | None = Field(default=None, ge=0)
    steps_per_day_max: int | None = Field(default=None, ge=0)

    @field_validator("storage_bytes_max")
    @classmethod
    def safe_storage_limit(cls, value: int | None) -> int | None:
        if value is not None and value > 9_223_372_036_854_775_807:
            raise ValueError("storage limit exceeds bigint range")
        return value


class QuotaProfileCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True
    limits: QuotaLimits = Field(default_factory=QuotaLimits)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("name cannot be blank")
        return cleaned


class QuotaProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    limits: QuotaLimits | None = None

    @model_validator(mode="after")
    def reject_empty_or_null(self):
        if not self.model_fields_set:
            raise ValueError("at least one change is required")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        if self.name is not None:
            self.name = self.name.strip()
        return self


class QuotaProfileRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    is_default: bool
    is_system: bool
    is_active: bool
    limits: QuotaLimits
    assigned_users_count: int
    created_at: datetime
    updated_at: datetime


class QuotaProfileSummary(BaseModel):
    id: UUID
    name: str
    is_default: bool
    is_system: bool
    is_active: bool
    limits: QuotaLimits


class QuotaProfileAssignment(BaseModel):
    quota_profile_id: UUID


class RegistrationApproval(BaseModel):
    quota_profile_id: UUID | None = None


class QuotaRegistryRead(BaseModel):
    key: QuotaKey
    scope: QuotaScope
    unit: str
    label: str
    description: str
    minimum: int = 0
    maximum: int
    enforced: bool


class EffectiveQuotaItem(BaseModel):
    key: QuotaKey
    scope: QuotaScope
    limit: int | None
    usage: int | None
    remaining: int | None
    unlimited: bool
    over_limit: bool
    enforced: bool


class EffectiveQuotaRead(BaseModel):
    user_id: UUID
    profile: QuotaProfileSummary
    quotas: list[EffectiveQuotaItem]


def registry_response() -> list[QuotaRegistryRead]:
    return [QuotaRegistryRead(**definition.__dict__, minimum=0) for definition in QUOTA_REGISTRY.values()]

