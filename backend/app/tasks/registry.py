from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.tasks.models import BackgroundTask

ProgressCallback = Callable[[int, int, str], None]


@dataclass(frozen=True)
class TaskHandlerResult:
    result: dict[str, Any]
    after_commit: tuple[Callable[[], None], ...] = ()


TaskHandler = Callable[[Session, BackgroundTask, ProgressCallback], dict[str, Any] | TaskHandlerResult]
HANDLERS: dict[str, TaskHandler] = {}
ROLLBACK_CLEANUPS_KEY = "transaction_rollback_cleanups"


def register_rollback_cleanup(session: Session, cleanup: Callable[[], None]) -> None:
    session.info.setdefault(ROLLBACK_CLEANUPS_KEY, []).append(cleanup)


def clear_rollback_cleanups(session: Session) -> None:
    session.info.pop(ROLLBACK_CLEANUPS_KEY, None)


def pop_rollback_cleanups(session: Session) -> list[Callable[[], None]]:
    return session.info.pop(ROLLBACK_CLEANUPS_KEY, [])


def task_handler(task_type: str):
    def register(handler: TaskHandler) -> TaskHandler:
        if task_type in HANDLERS:
            raise RuntimeError(f"Duplicate task handler: {task_type}")
        HANDLERS[task_type] = handler
        return handler
    return register
