"""Crash-recovery supervisor for background tasks.

A non-terminal task must always be either owned by a live executor (valid
lease), detectable as stale, or terminally failed. This module implements the
periodic detection + bounded re-dispatch half of that contract. The actual
re-execution always goes through :func:`app.tasks.service.execute_task`, whose
atomic claim keeps recovery idempotent and race-safe across workers.
"""

from __future__ import annotations

from collections.abc import Callable
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.orm import Session

from app.config import task_settings
from app.tasks.models import BackgroundTask

logger = logging.getLogger(__name__)


def _expired(task: BackgroundTask) -> bool:
    expires_at = task.expires_at
    if expires_at.tzinfo is not None:
        expires_at = expires_at.astimezone(UTC).replace(tzinfo=None)
    return expires_at <= datetime.now(UTC).replace(tzinfo=None)


def _fail_exhausted(session: Session, task: BackgroundTask) -> bool:
    conditions = [
        BackgroundTask.id == task.id,
        BackgroundTask.status == task.status,
        BackgroundTask.attempt_count == task.attempt_count,
    ]
    if task.status == "running":
        conditions.extend((
            or_(
                and_(
                    BackgroundTask.lease_expires_at.is_not(None),
                    BackgroundTask.lease_expires_at <= func.clock_timestamp(),
                ),
                and_(
                    BackgroundTask.lease_expires_at.is_(None),
                    BackgroundTask.heartbeat_at.is_not(None),
                    BackgroundTask.heartbeat_at <= func.clock_timestamp() - timedelta(
                        seconds=task_settings.stale_after_seconds
                    ),
                ),
                and_(
                    BackgroundTask.lease_expires_at.is_(None),
                    BackgroundTask.heartbeat_at.is_(None),
                    BackgroundTask.started_at.is_not(None),
                    BackgroundTask.started_at <= func.clock_timestamp() - timedelta(
                        seconds=task_settings.stale_after_seconds
                    ),
                ),
            ),
            BackgroundTask.lease_token == task.lease_token
            if task.lease_token is not None
            else BackgroundTask.lease_token.is_(None),
            BackgroundTask.lease_owner == task.lease_owner
            if task.lease_owner is not None
            else BackgroundTask.lease_owner.is_(None),
        ))
    else:
        conditions.append(
            BackgroundTask.created_at <= func.clock_timestamp() - timedelta(seconds=task_settings.lease_seconds)
        )
    outcome = session.execute(update(BackgroundTask).where(*conditions).values(
        status="failed",
        error_code="worker_interrupted",
        error_message="Le traitement a été interrompu et le nombre maximal de tentatives est atteint.",
        progress_message="Traitement interrompu",
        finished_at=func.now(),
        lease_owner=None,
        lease_token=None,
        lease_expires_at=None,
    ))
    if outcome.rowcount != 1:
        return False
    if task.task_type == "vector_basemap_prepare":
        # A hard crash can bypass the vector handler's error boundary. Keep the
        # catalog row from looking permanently active once the task's bounded
        # attempts are exhausted; a later explicit install can create a new
        # task and retry it.
        from app.basemaps.vector_models import VectorBasemap

        session.execute(update(VectorBasemap).where(VectorBasemap.task_id == task.id).values(
            state="error",
            phase="Interrompu",
            progress=None,
            last_error_code="INTERRUPTED",
            last_error_message="La préparation a été interrompue et le nombre maximal de tentatives est atteint.",
            generation_finished_at=func.now(),
        ))
    logger.info(
        "task_permanently_failed task_id=%s type=%s attempt=%d/%d",
        task.id, task.task_type, task.attempt_count, task.max_attempts,
    )
    return True


def _stale_running_tasks(session: Session, batch: int) -> list[BackgroundTask]:
    lease_expired = and_(
        BackgroundTask.lease_expires_at.is_not(None),
        BackgroundTask.lease_expires_at <= func.clock_timestamp(),
    )
    legacy_unowned = and_(
        BackgroundTask.lease_expires_at.is_(None),
        BackgroundTask.heartbeat_at.is_not(None),
        BackgroundTask.heartbeat_at <= func.clock_timestamp() - timedelta(seconds=task_settings.stale_after_seconds),
    )
    legacy_never_seen = and_(
        BackgroundTask.lease_expires_at.is_(None),
        BackgroundTask.heartbeat_at.is_(None),
        BackgroundTask.started_at.is_not(None),
        BackgroundTask.started_at <= func.clock_timestamp() - timedelta(seconds=task_settings.stale_after_seconds),
    )
    return list(session.scalars(select(BackgroundTask).where(
        BackgroundTask.status == "running",
        or_(lease_expired, legacy_unowned, legacy_never_seen),
    ).order_by(
        case((or_(
            BackgroundTask.attempt_count >= BackgroundTask.max_attempts,
            BackgroundTask.expires_at <= func.clock_timestamp(),
        ), 0), else_=1),
        BackgroundTask.created_at,
    ).limit(batch)).all())


def _orphaned_pending_tasks(session: Session, batch: int) -> list[BackgroundTask]:
    grace = timedelta(seconds=task_settings.lease_seconds)
    return list(session.scalars(select(BackgroundTask).where(
        BackgroundTask.status == "pending",
        BackgroundTask.created_at <= func.clock_timestamp() - grace,
    ).order_by(
        case((or_(
            BackgroundTask.attempt_count >= BackgroundTask.max_attempts,
            BackgroundTask.expires_at <= func.clock_timestamp(),
        ), 0), else_=1),
        BackgroundTask.created_at,
    ).limit(batch)).all())


def run_recovery_cycle(session: Session, dispatch: Callable[[str], bool]) -> tuple[int, int, int]:
    """Detect stale tasks and re-dispatch them.

    ``dispatch(task_id)`` must make :func:`app.tasks.service.execute_task` run
    again for the task (enqueue for Redis mode, in-process execution for sync
    mode). Returns ``(redispatched, exhausted_failed, skipped)``.
    """
    batch = task_settings.recovery_batch_size
    redispatched = 0
    failed = 0
    skipped = 0

    for task in _stale_running_tasks(session, batch):
        if task.attempt_count >= task.max_attempts or _expired(task):
            if _fail_exhausted(session, task):
                failed += 1
            continue
        logger.info(
            "task_stale_detected task_id=%s type=%s owner=%s attempt=%d/%d",
            task.id, task.task_type, task.lease_owner or "inconnu",
            task.attempt_count, task.max_attempts,
        )
        if dispatch(str(task.id)):
            redispatched += 1
        else:
            skipped += 1

    for task in _orphaned_pending_tasks(session, batch):
        if task.attempt_count >= task.max_attempts or _expired(task):
            if _fail_exhausted(session, task):
                failed += 1
            continue
        logger.info(
            "task_orphaned_pending task_id=%s type=%s attempt=%d/%d",
            task.id, task.task_type, task.attempt_count, task.max_attempts,
        )
        if dispatch(str(task.id)):
            redispatched += 1
        else:
            skipped += 1

    session.commit()
    if redispatched or failed:
        logger.info(
            "task_recovery_cycle mode=%s redispatched=%d exhausted_failed=%d skipped=%d",
            task_settings.mode, redispatched, failed, skipped,
        )
    return redispatched, failed, skipped


def dispatch_sync(task_id: str) -> bool:
    """Re-run a task inside the current (sync-mode) process."""
    import threading

    from app.tasks.service import execute_task

    threading.Thread(
        target=execute_task, args=(task_id,), name=f"task-recovery-{task_id}", daemon=True,
    ).start()
    return True


def dispatch_redis(task_id: str) -> bool:
    """Ensure a Redis job exists for the task, re-enqueueing dead deliveries."""
    from uuid import UUID

    from redis import Redis
    from rq import Queue
    from rq.job import JobStatus

    from app.database import SessionLocal
    from app.tasks.service import _enqueue_kwargs

    session = SessionLocal()
    try:
        task = session.get(BackgroundTask, UUID(task_id))
    finally:
        session.close()
    if task is None or task.status in {"succeeded", "failed", "cancelled", "expired"}:
        return False

    connection = Redis.from_url(task_settings.redis_url)
    queue = Queue(task_settings.queue_name, connection=connection)
    existing = queue.fetch_job(str(task.id))
    if existing is not None:
        state = existing.get_status()
        if state in {JobStatus.QUEUED, JobStatus.SCHEDULED, JobStatus.DEFERRED}:
            return False
        # A STARTED job for a lease-expired task belongs to a dead worker; a
        # live worker holds a valid lease and is never dispatched here.
        # FINISHED/FAILED/STOPPED/CANCELED jobs are terminal leftovers.
        try:
            existing.delete(remove_from_queue=True)
        except Exception:
            logger.warning("Unable to remove stale Redis job task_id=%s state=%s", task_id, state, exc_info=True)
    queue.enqueue("app.tasks.service.execute_task", str(task.id), **_enqueue_kwargs(task))
    logger.info("task_requeued task_id=%s type=%s", task.id, task.task_type)
    return True


def dispatcher_for_current_mode() -> Callable[[str], bool]:
    return dispatch_redis if task_settings.mode == "redis" else dispatch_sync
