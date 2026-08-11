from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


StarterProfileId = Literal[
    "general", "urbex", "tourism", "photography", "hiking",
    "heritage", "road_trip", "gastronomy", "custom",
]
StarterProfileResourceType = Literal["categories", "tags", "statuses"]


class StarterProfileOptions(BaseModel):
    categories: bool = True
    tags: bool = True
    statuses: bool = True


class StarterProfileImport(BaseModel):
    map_id: UUID
    resource_type: StarterProfileResourceType


class StarterProfileImportResult(BaseModel):
    created: int = Field(ge=0)
    skipped: int = Field(ge=0)


class ProfileCategoryRead(BaseModel):
    key: str
    name: str
    icon_id: str
    sort_order: int = Field(ge=0)


class ProfileTagRead(BaseModel):
    key: str
    name: str
    color: str
    sort_order: int = Field(ge=0)


class ProfileStatusRead(BaseModel):
    key: str
    name: str
    color: str
    sort_order: int = Field(ge=0)
    functional_state: Literal["non_visited", "visited"]
    is_default: bool


class StarterProfileRead(BaseModel):
    id: StarterProfileId
    name: str
    description: str
    ui_icon: str
    categories: list[ProfileCategoryRead]
    tags: list[ProfileTagRead]
    statuses: list[ProfileStatusRead]
