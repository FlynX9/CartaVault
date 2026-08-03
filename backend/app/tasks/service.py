from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from redis import Redis
from rq import Queue, Retry
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import task_settings
from app.database import SessionLocal
from app.tasks.models import BackgroundTask
from app.tasks.registry import HANDLERS
from app.tasks.schemas import TaskRead

logger = logging.getLogger(__name__)
TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled", "expired"})


class TaskCancelled(Exception):
    pass


def to_read(task: BackgroundTask) -> TaskRead:
    total = max(1, task.progress_total)
    current = min(max(0, task.progress_current), total)
    return TaskRead(
        id=task.id, task_type=task.task_type, map_id=task.map_id,
        resource_type=task.resource_type, resource_id=task.resource_id,
        status=task.status, progress_current=current, progress_total=total,
        percent=round(current * 100 / total), progress_message=task.progress_message,
        result=task.result_json, error_code=task.error_code, error_message=task.error_message,
        created_at=task.created_at, started_at=task.started_at, finished_at=task.finished_at,
        expires_at=task.expires_at,
    )


def create_task(
    session: Session, *, task_type: str, user_id: UUID, map_id: UUID | None,
    resource_type: str | None = None, resource_id: UUID | None = None,
    input_json: dict[str, Any] | None = None, dedupe_key: str | None = None,
    max_attempts: int = 3,
) -> BackgroundTask:
    if task_type not in HANDLERS:
        raise RuntimeError(f"No handler registered for task type {task_type}")
    now = datetime.now(UTC)
    if dedupe_key:
        existing = session.scalar(select(BackgroundTask).where(
            BackgroundTask.requested_by_user_id == user_id,
            BackgroundTask.dedupe_key == dedupe_key,
            BackgroundTask.status.in_(("pending", "running")),
        ).order_by(BackgroundTask.created_at.desc()))
        if existing is not None:
            return existing
    task = BackgroundTask(
        task_type=task_type, requested_by_user_id=user_id, map_id=map_id,
        resource_type=resource_type, resource_id=resource_id,
        input_json=input_json or {}, dedupe_key=dedupe_key, max_attempts=max_attempts,
        expires_at=now + timedelta(seconds=task_settings.result_ttl_seconds),
    )
    session.add(task)
    session.flush()
    return task


def submit_task(session: Session, task: BackgroundTask) -> BackgroundTask:
    if task_settings.mode == "sync":
        _execute_with_session(session, task)
        return task
    session.commit()
    try:
        connection = Redis.from_url(task_settings.redis_url)
        Queue(task_settings.queue_name, connection=connection).enqueue(
            "app.tasks.service.execute_task",
            str(task.id),
            job_id=str(task.id),
            job_timeout=task_settings.default_timeout_seconds,
            result_ttl=task_settings.result_ttl_seconds,
            failure_ttl=task_settings.result_ttl_seconds,
            retry=Retry(max=max(0, task.max_attempts - 1), interval=[10, 60, 300]),
        )
    except Exception as error:
        logger.exception("Unable to enqueue background task task_id=%s", task.id)
        task.status = "failed"
        task.error_code = "broker_unavailable"
        task.error_message = "Le service de tâches est temporairement indisponible."
        task.finished_at = datetime.now(UTC)
        session.add(task)
        session.commit()
        raise HTTPException(503, task.error_message) from error
    return task


def execute_task(task_id: str) -> None:
    # Importing handlers here keeps worker registration explicit and avoids
    # loading task-only dependencies in every API process.
    import app.tasks.handlers  # noqa: F401

    session = SessionLocal()
    try:
        task = session.get(BackgroundTask, UUID(task_id))
        if task is None or task.status in TERMINAL_STATUSES:
            return
        _execute_with_session(session, task, commit_progress=True)
    finally:
        session.close()


def _execute_with_session(session: Session, task: BackgroundTask, *, commit_progress: bool = False) -> None:
    now = datetime.now(UTC)
    if task.cancel_requested_at is not None:
        task.status = "cancelled"
        task.finished_at = now
        session.commit()
        return
    task.status = "running"
    task.started_at = task.started_at or now
    task.heartbeat_at = now
    task.attempt_count += 1
    task.progress_message = "Traitement en cours"
    session.commit() if commit_progress else session.flush()

    def progress(current: int, total: int, message: str) -> None:
        safe_total = max(1, total)
        values = {
            "progress_current": min(max(0, current), safe_total),
            "progress_total": safe_total,
            "progress_message": message[:255],
            "heartbeat_at": datetime.now(UTC),
        }
        if commit_progress:
            progress_session = SessionLocal()
            try:
                cancellation = progress_session.scalar(select(BackgroundTask.cancel_requested_at).where(BackgroundTask.id == task.id))
                if cancellation is not None:
                    raise TaskCancelled
                progress_session.execute(update(BackgroundTask).where(BackgroundTask.id == task.id).values(**values))
                progress_session.commit()
            finally:
                progress_session.close()
        else:
            for key, value in values.items():
                setattr(task, key, value)

    try:
        handler = HANDLERS[task.task_type]
        task.result_json = handler(session, task, progress)
        if commit_progress:
            session.refresh(task, attribute_names=["progress_total"])
        task.status = "succeeded"
        task.progress_current = max(task.progress_total, 1)
        task.progress_message = "Terminé"
        task.error_code = None
        task.error_message = None
        task.finished_at = datetime.now(UTC)
        session.commit()
    except TaskCancelled:
        session.rollback()
        session.execute(update(BackgroundTask).where(BackgroundTask.id == task.id).values(
            status="cancelled", progress_message="Annulé", finished_at=datetime.now(UTC),
        ))
        session.commit()
    except HTTPException as error:
        session.rollback()
        _mark_failed(session, task.id, "invalid_request", str(error.detail))
    except Exception:
        session.rollback()
        logger.exception("Background task failed task_id=%s type=%s", task.id, task.task_type)
        if commit_progress and task.attempt_count < task.max_attempts:
            session.execute(update(BackgroundTask).where(BackgroundTask.id == task.id).values(
                status="pending", error_code="retry_scheduled",
                error_message="Une nouvelle tentative est planifiée.",
                progress_message="Nouvelle tentative planifiée",
            ))
            session.commit()
            raise
        _mark_failed(session, task.id, "task_failed", "Le traitement a échoué.")
        if commit_progress:
            raise


def _mark_failed(session: Session, task_id: UUID, code: str, message: str) -> None:
    session.execute(update(BackgroundTask).where(BackgroundTask.id == task_id).values(
        status="failed", error_code=code, error_message=message,
        progress_message="Traitement interrompu", finished_at=datetime.now(UTC),
    ))
    session.commit()


def cancel_task(session: Session, task: BackgroundTask) -> BackgroundTask:
    if task.status in TERMINAL_STATUSES:
        return task
    now = datetime.now(UTC)
    task.cancel_requested_at = now
    if task.status == "pending":
        task.status = "cancelled"
        task.finished_at = now
        task.progress_message = "Annulé"
    session.commit()
    if task_settings.mode == "redis":
        try:
            Queue(task_settings.queue_name, connection=Redis.from_url(task_settings.redis_url)).remove(str(task.id))
        except Exception:
            logger.warning("Unable to remove cancelled task from Redis task_id=%s", task.id, exc_info=True)
    return task


def recover_abandoned_tasks(session: Session) -> tuple[int, int]:
    cutoff = datetime.now(UTC) - timedelta(seconds=task_settings.stale_after_seconds)
    failed = session.execute(update(BackgroundTask).where(
        BackgroundTask.status == "running",
        BackgroundTask.heartbeat_at < cutoff,
    ).values(
        status="failed", error_code="worker_interrupted",
        error_message="Le worker a été interrompu pendant le traitement.",
        progress_message="Traitement interrompu", finished_at=datetime.now(UTC),
    )).rowcount or 0
    expired = session.execute(update(BackgroundTask).where(
        BackgroundTask.status.in_(("pending", "succeeded", "failed", "cancelled")),
        BackgroundTask.expires_at < datetime.now(UTC),
    ).values(status="expired")).rowcount or 0
    session.commit()
    return failed, expired


def requeue_pending_tasks(session: Session) -> int:
    if task_settings.mode != "redis":
        return 0
    queue = Queue(task_settings.queue_name, connection=Redis.from_url(task_settings.redis_url))
    task_ids = session.scalars(select(BackgroundTask.id).where(
        BackgroundTask.status == "pending",
        BackgroundTask.expires_at > datetime.now(UTC),
    )).all()
    queued = 0
    for task_id in task_ids:
        if queue.fetch_job(str(task_id)) is not None:
            continue
        task = session.get(BackgroundTask, task_id)
        queue.enqueue(
            "app.tasks.service.execute_task", str(task_id), job_id=str(task_id),
            job_timeout=task_settings.default_timeout_seconds,
            result_ttl=task_settings.result_ttl_seconds,
            failure_ttl=task_settings.result_ttl_seconds,
            retry=Retry(max=max(0, (task.max_attempts if task else 3) - 1), interval=[10, 60, 300]),
        )
        queued += 1
    return queued
