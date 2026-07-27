from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


TrashItemType = Literal["map", "place", "trip"]


class TrashItemRead(BaseModel):
    id: UUID
    item_type: TrashItemType
    name: str
    map_id: UUID | None
    map_name: str | None
    deleted_at: datetime
    purge_after: datetime
    days_remaining: int
    can_restore: bool
    can_delete_permanently: bool
