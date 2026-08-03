from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.database import get_db
from app.tasks.models import BackgroundTask
from app.tasks.schemas import TaskRead
from app.tasks.service import cancel_task, to_read

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _owned_task(session: Session, task_id: UUID, user: User) -> BackgroundTask:
    task = session.get(BackgroundTask, task_id)
    if task is None or task.requested_by_user_id != user.id:
        raise HTTPException(404, "Task not found")
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(
    limit: int = Query(20, ge=1, le=100), session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskRead]:
    tasks = session.scalars(select(BackgroundTask).where(
        BackgroundTask.requested_by_user_id == user.id,
    ).order_by(BackgroundTask.created_at.desc()).limit(limit)).all()
    return [to_read(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskRead)
def read_task(task_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TaskRead:
    return to_read(_owned_task(session, task_id, user))


@router.delete("/{task_id}", response_model=TaskRead)
def request_task_cancellation(task_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TaskRead:
    return to_read(cancel_task(session, _owned_task(session, task_id, user)))
