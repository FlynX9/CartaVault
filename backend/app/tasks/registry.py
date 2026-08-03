from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.tasks.models import BackgroundTask

ProgressCallback = Callable[[int, int, str], None]
TaskHandler = Callable[[Session, BackgroundTask, ProgressCallback], dict[str, Any]]
HANDLERS: dict[str, TaskHandler] = {}


def task_handler(task_type: str):
    def register(handler: TaskHandler) -> TaskHandler:
        if task_type in HANDLERS:
            raise RuntimeError(f"Duplicate task handler: {task_type}")
        HANDLERS[task_type] = handler
        return handler
    return register
