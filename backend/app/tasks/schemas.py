from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


TaskStatus = Literal["pending", "running", "succeeded", "failed", "cancelled", "expired"]


class TaskRead(BaseModel):
    id: UUID
    task_type: str
    map_id: UUID | None
    resource_type: str | None
    resource_id: UUID | None
    status: TaskStatus
    progress_current: int = Field(ge=0)
    progress_total: int = Field(gt=0)
    percent: int = Field(ge=0, le=100)
    progress_message: str
    result: dict | None
    error_code: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    expires_at: datetime


class TaskStart(BaseModel):
    task_id: UUID
    status: TaskStatus
