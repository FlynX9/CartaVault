from typing import Literal

from pydantic import BaseModel, Field


StarterProfileId = Literal[
    "general", "urbex", "tourism", "photography", "hiking",
    "heritage", "road_trip", "gastronomy", "custom",
]


class StarterProfileOptions(BaseModel):
    categories: bool = True
    tags: bool = True
    statuses: bool = True


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
