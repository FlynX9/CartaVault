from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.countries.schemas import CountrySummary
from app.auth.schemas import UserRead
from app.places.fields import CONFIGURABLE_PLACE_FIELDS, normalize_place_field_config


class MapCreate(BaseModel):
    country_id: UUID
    name: str | None = Field(default=None, min_length=1, max_length=120)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    default_zoom: int | None = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def validate_center(self) -> Self:
        if (self.center_latitude is None) != (self.center_longitude is None):
            raise ValueError("Center latitude and longitude must be provided together")
        return self


class MapUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    center_latitude: float | None = Field(default=None, ge=-90, le=90)
    center_longitude: float | None = Field(default=None, ge=-180, le=180)
    default_zoom: int | None = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def validate_update(self) -> Self:
        supplied = self.model_fields_set
        if "name" in supplied and self.name is None:
            raise ValueError("The name cannot be null")
        center_fields = {"center_latitude", "center_longitude"}
        if supplied & center_fields and not center_fields <= supplied:
            raise ValueError("Center latitude and longitude must be provided together")
        if center_fields <= supplied and ((self.center_latitude is None) != (self.center_longitude is None)):
            raise ValueError("Center latitude and longitude must both be null or both be coordinates")
        return self


class MapRead(BaseModel):
    id: UUID
    name: str
    country_id: UUID
    country: CountrySummary
    center_latitude: float | None
    center_longitude: float | None
    default_zoom: int | None
    effective_center_latitude: float
    effective_center_longitude: float
    effective_default_zoom: int
    min_latitude: float | None
    max_latitude: float | None
    min_longitude: float | None
    max_longitude: float | None
    created_at: datetime
    updated_at: datetime
    owner_id: UUID
    owner_email: str
    owner_display_name: str
    is_private: bool
    is_shared: bool
    current_user_role: str
    can_edit: bool
    can_delete: bool
    can_manage_members: bool
    can_transfer_ownership: bool
    can_import: bool
    can_export: bool
    place_field_config: dict[str, bool]


class MapPlaceFieldConfig(BaseModel):
    fields: dict[str, bool]

    @model_validator(mode="after")
    def validate_fields(self) -> Self:
        unknown = set(self.fields) - set(CONFIGURABLE_PLACE_FIELDS)
        if unknown:
            raise ValueError(f"Unknown configurable place fields: {', '.join(sorted(unknown))}")
        self.fields = normalize_place_field_config(self.fields)
        return self


class MapSummary(BaseModel):
    id: UUID
    name: str
    country: CountrySummary


class MembershipRead(BaseModel):
    user: UserRead
    role: str
    created_at: datetime
    updated_at: datetime


class MembershipUpdate(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")


class InvitationCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(pattern="^(editor|viewer)$")


class InvitationRead(BaseModel):
    id: UUID
    map_id: UUID
    email: str
    role: str
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    invitation_url: str | None = None


class InvitationPublicRead(BaseModel):
    map_name: str
    email: str
    role: str
    expires_at: datetime
    requires_account: bool


class PendingInvitationRead(BaseModel):
    id: UUID
    map_id: UUID
    map_name: str
    role: str
    invited_by_display_name: str
    created_at: datetime
    expires_at: datetime


class InvitationAccept(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=12, max_length=1024)


class TransferOwnership(BaseModel):
    new_owner_user_id: UUID
