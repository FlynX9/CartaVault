from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
import os
import socket
import threading
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
import redis
from redis import Redis
from rq import Queue
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import task_settings
from app.database import SessionLocal
from app.tasks.fault_injection import crash_point, processing_stall
from app.tasks.models import BackgroundTask
from app.tasks.registry import HANDLERS, TaskHandlerResult, clear_rollback_cleanups, pop_rollback_cleanups
from app.tasks.schemas import TaskRead

logger = logging.getLogger(__name__)
TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled", "expired"})
CREATED_TASK_IDS_KEY = "created_task_ids"
CLAIM_TOKENS_KEY = "task_claim_tokens"


class TaskCancelled(Exception):
    pass


class TaskLeaseLost(Exception):
    """Raised when the executor discovers its lease was reclaimed."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _owner_identity() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid4().hex[:8]}"[:120]


@dataclass(frozen=True)
class TaskClaim:
    """Immutable identity of one ownership interval for a task.

    ``BackgroundTask`` remains available through the read-only handle for
    existing handlers, but all state-changing operations use these captured
    values.  In particular, an executor must never re-read a replacement
    token after its lease has been reclaimed.
    """

    task: BackgroundTask
    owner: str
    token: UUID

    @property
    def task_id(self) -> UUID:
        return self.task.id

    @property
    def id(self) -> UUID:
        return self.task.id

    @property
    def lease_token(self) -> UUID:
        return self.token

    @property
    def lease_owner(self) -> str:
        return self.owner

    @property
    def claim_token(self) -> UUID:
        return self.token

    def __getattr__(self, name: str) -> Any:
        # Keep task handlers written against BackgroundTask source-compatible
        # while preventing them from changing the immutable claim identity.
        return getattr(self.task, name)


def _claim_values(
    session: Session,
    claim_or_task_id: TaskClaim | UUID | BackgroundTask,
    owner: str | None = None,
) -> tuple[UUID, str, UUID]:
    """Return a claim identity, with a narrow compatibility path.

    New executor code always passes ``TaskClaim``.  The UUID/owner form is
    retained for older internal callers and tests; it obtains the token only
    when no immutable handle was supplied and is not used by execution paths.
    """
    if isinstance(claim_or_task_id, TaskClaim):
        return claim_or_task_id.task_id, claim_or_task_id.owner, claim_or_task_id.token
    if isinstance(claim_or_task_id, BackgroundTask):
        if claim_or_task_id.lease_owner is None or claim_or_task_id.lease_token is None:
            raise TaskLeaseLost()
        token = session.info.get(CLAIM_TOKENS_KEY, {}).get(
            (claim_or_task_id.id, claim_or_task_id.lease_owner),
            claim_or_task_id.lease_token,
        )
        return claim_or_task_id.id, claim_or_task_id.lease_owner, token
    if owner is None:
        raise TypeError("A task claim owner is required")
    # Compatibility for pre-token helper callers is deliberately fail-closed:
    # only a token captured by this Session's claim_task call is accepted.  We
    # must not query the current row here, because doing so would let a stale
    # executor adopt the replacement token after a same-owner reclaim.
    token = session.info.get(CLAIM_TOKENS_KEY, {}).get((claim_or_task_id, owner))
    if token is None:
        raise TaskLeaseLost()
    return claim_or_task_id, owner, token


def ensure_task_held(
    session: Session,
    claim: TaskClaim,
) -> None:
    """Fence the current transaction to an unexpired claim.

    This deliberately does not commit.  When used immediately before a
    business commit, the guarded UPDATE and the business mutation are in the
    same PostgreSQL transaction.  A recovery claim therefore either waits for
    that transaction and sees the old token, or the UPDATE affects zero rows
    and the whole transaction is rolled back.
    """
    outcome = session.execute(update(BackgroundTask).where(
        BackgroundTask.id == claim.task_id,
        BackgroundTask.status == "running",
        BackgroundTask.lease_owner == claim.owner,
        BackgroundTask.lease_token == claim.token,
        BackgroundTask.lease_expires_at > func.clock_timestamp(),
    ).values(heartbeat_at=func.clock_timestamp()))
    if outcome.rowcount != 1:
        session.rollback()
        raise TaskLeaseLost()


def renew_task_lease(session: Session, claim: TaskClaim) -> bool:
    """Renew a claim only while its exact token is still current."""
    renewed = session.execute(update(BackgroundTask).where(
        BackgroundTask.id == claim.task_id,
        BackgroundTask.status == "running",
        BackgroundTask.lease_owner == claim.owner,
        BackgroundTask.lease_token == claim.token,
        BackgroundTask.lease_expires_at > func.clock_timestamp(),
    ).values(
        heartbeat_at=func.clock_timestamp(),
        lease_expires_at=func.clock_timestamp() + timedelta(seconds=task_settings.lease_seconds),
    ))
    if renewed.rowcount != 1:
        session.rollback()
        return False
    session.commit()
    return True


def _run_after_commit(cleanups: tuple[Any, ...]) -> None:
    for cleanup in cleanups:
        try:
            cleanup()
        except Exception:
            logger.warning("Unable to complete post-commit cleanup", exc_info=True)


def _run_rollback_cleanups(session: Session) -> None:
    for cleanup in reversed(pop_rollback_cleanups(session)):
        try:
            cleanup()
        except Exception:
            logger.warning("Unable to compensate storage after transaction rollback", exc_info=True)


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


def rq_retry_policy(max_attempts: int) -> None:
    """Redis is used purely as a *delivery* mechanism; no RQ-level retry.

    Retry, backoff, and attempt accounting live in the database and are driven
    by the recovery supervisor (see :mod:`app.tasks.recovery`), which keeps a
    single source of truth for task state. Returning ``None`` also removes the
    invalid ``Retry(max=0)`` configuration that previously broke enqueueing for
    ``max_attempts=1`` tasks (RES-006): with no Retry object, RQ has nothing to
    reject. Keeping RQ retries would additionally place failed jobs in RQ's
    scheduled-retry registry, which the worker does not run a scheduler for and
    which would bypass the DB lease/attempt contract.
    """
    del max_attempts
    return None


def _enqueue_kwargs(task: BackgroundTask) -> dict[str, Any]:
    return {
        "job_id": str(task.id),
        "job_timeout": task_settings.default_timeout_seconds,
        "result_ttl": task_settings.result_ttl_seconds,
        "failure_ttl": task_settings.result_ttl_seconds,
        "retry": rq_retry_policy(task.max_attempts),
    }


def create_task(
    session: Session, *, task_type: str, user_id: UUID, map_id: UUID | None,
    resource_type: str | None = None, resource_id: UUID | None = None,
    input_json: dict[str, Any] | None = None, dedupe_key: str | None = None,
    max_attempts: int = 3,
) -> BackgroundTask:
    if task_type not in HANDLERS:
        raise RuntimeError(f"No handler registered for task type {task_type}")
    now = _utcnow()
    if dedupe_key:
        existing = session.scalar(select(BackgroundTask).where(
            BackgroundTask.requested_by_user_id == user_id,
            BackgroundTask.dedupe_key == dedupe_key,
            BackgroundTask.status.in_(("pending", "running")),
        ).order_by(BackgroundTask.created_at.desc()))
        if existing is not None:
            if not _lease_active(existing, now):
                # A stale duplicate must never be returned as if it were
                # healthy work. Reset it to a recoverable state so the
                # recovery supervisor (or an immediate resubmission) can
                # re-dispatch it instead of blocking the caller forever.
                _kick_stale_task(session, existing)
            return existing
    task = BackgroundTask(
        task_type=task_type, requested_by_user_id=user_id, map_id=map_id,
        resource_type=resource_type, resource_id=resource_id,
        input_json=input_json or {}, dedupe_key=dedupe_key, max_attempts=max_attempts,
        expires_at=now + timedelta(seconds=task_settings.result_ttl_seconds),
    )
    session.add(task)
    session.flush()
    session.info.setdefault(CREATED_TASK_IDS_KEY, set()).add(task.id)
    return task


def _naive_utc(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo is not None else value


def _lease_active(task: BackgroundTask, now: datetime) -> bool:
    reference = _naive_utc(now)
    if task.status == "running":
        expires = task.lease_expires_at
        return expires is not None and _naive_utc(expires) > reference
    # A pending task is considered active while it is still within the initial
    # dispatch/claim window; older pending tasks are treated as orphaned.
    age = reference - _naive_utc(task.created_at)
    return age < timedelta(seconds=task_settings.lease_seconds)


def _kick_stale_task(session: Session, task: BackgroundTask) -> None:
    """Reset a stale non-terminal task so recovery will re-dispatch it."""
    if task.status == "running":
        previous_owner = task.lease_owner or "inconnu"
        stale_reset = session.execute(update(BackgroundTask).where(
            BackgroundTask.id == task.id,
            BackgroundTask.status == "running",
            or_(
                BackgroundTask.lease_expires_at.is_(None),
                BackgroundTask.lease_expires_at <= func.clock_timestamp(),
            ),
            (
                BackgroundTask.lease_token.is_(None)
                if task.lease_token is None
                else BackgroundTask.lease_token == task.lease_token
            ),
        ).values(
            status="pending", lease_owner=None, lease_token=None, lease_expires_at=None,
            error_code="worker_interrupted",
            error_message=f"Le traitement {previous_owner} a été interrompu; reprise planifiée.",
            progress_message="Reprise planifiée",
        ))
        if stale_reset.rowcount != 1:
            session.rollback()
            return
        session.commit()
        logger.info(
            "task_reset_for_recovery task_id=%s type=%s previous_owner=%s attempt=%d",
            task.id, task.task_type, previous_owner, task.attempt_count,
        )
    else:
        session.commit()


def submit_task(session: Session, task: BackgroundTask) -> BackgroundTask:
    created_task_ids = session.info.setdefault(CREATED_TASK_IDS_KEY, set())
    if task.id not in created_task_ids:
        return task
    created_task_ids.discard(task.id)
    if task_settings.mode == "sync":
        # Persist the task before running it so a handler rollback cannot erase
        # the task row that must report the failure.
        session.commit()
        _execute_with_session(session, task)
        return task
    session.commit()
    try:
        connection = Redis.from_url(task_settings.redis_url)
        Queue(task_settings.queue_name, connection=connection).enqueue(
            "app.tasks.service.execute_task", str(task.id), **_enqueue_kwargs(task),
        )
    except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as error:
        logger.exception("Unable to reach the task broker task_id=%s", task.id)
        _fail_submission(session, task, "broker_unavailable", "Le service de tâches est temporairement indisponible.")
        raise HTTPException(503, "Le service de tâches est temporairement indisponible.") from error
    except ValueError as error:
        # Invalid queue/retry configuration is a server misconfiguration, not
        # a broker outage. Keep the task visible with a truthful diagnostic.
        logger.exception("Invalid task queue configuration task_id=%s", task.id)
        _fail_submission(session, task, "task_queue_config", "La configuration de la file de tâches est invalide.")
        raise HTTPException(500, "La configuration de la file de tâches est invalide.") from error
    except Exception as error:
        logger.exception("Unable to enqueue background task task_id=%s", task.id)
        _fail_submission(session, task, "enqueue_failed", "Le service de tâches est temporairement indisponible.")
        raise HTTPException(503, "Le service de tâches est temporairement indisponible.") from error
    return task


def _fail_submission(session: Session, task: BackgroundTask, code: str, message: str) -> None:
    task.status = "failed"
    task.error_code = code
    task.error_message = message
    task.progress_message = "Traitement interrompu"
    task.finished_at = _utcnow()
    task.lease_owner = None
    task.lease_token = None
    task.lease_expires_at = None
    session.add(task)
    session.commit()


def claim_task(session: Session, task_id: UUID, owner: str) -> TaskClaim | None:
    """Atomically acquire ownership of a claimable task.

    The transition is a single guarded UPDATE: pending tasks are always
    claimable, running tasks only once their lease has expired, and tasks that
    exhausted their attempts are refused. Two concurrent executors therefore
    cannot both win the claim.
    """
    lease = timedelta(seconds=task_settings.lease_seconds)
    token = uuid4()
    statement = (
        update(BackgroundTask)
        .where(
            BackgroundTask.id == task_id,
            BackgroundTask.status.in_(("pending", "running")),
            BackgroundTask.attempt_count < BackgroundTask.max_attempts,
            BackgroundTask.expires_at > func.clock_timestamp(),
            or_(
                BackgroundTask.status == "pending",
                BackgroundTask.lease_expires_at.is_(None),
                BackgroundTask.lease_expires_at <= func.clock_timestamp(),
            ),
        )
        .values(
            status="running",
            lease_owner=owner,
            lease_token=token,
            lease_expires_at=func.clock_timestamp() + lease,
            heartbeat_at=func.clock_timestamp(),
            started_at=func.coalesce(BackgroundTask.started_at, func.now()),
            attempt_count=BackgroundTask.attempt_count + 1,
            progress_message="Traitement en cours",
        )
    )
    claimed_id = session.execute(statement.returning(BackgroundTask.id)).scalar_one_or_none()
    session.commit()
    if claimed_id is None:
        return None
    claimed = session.get(BackgroundTask, claimed_id)
    if claimed is None:
        # The row cannot disappear while a valid lease is held, but fail
        # closed if a database trigger or external maintenance removes it.
        raise TaskLeaseLost()
    session.refresh(claimed)
    session.info.setdefault(CLAIM_TOKENS_KEY, {}).setdefault((task_id, owner), token)
    logger.info(
        "task_claimed task_id=%s type=%s owner=%s attempt=%d/%d token=%s",
        task_id, claimed.task_type, owner, claimed.attempt_count, claimed.max_attempts, token,
    )
    return TaskClaim(task=claimed, owner=owner, token=token)


class _LeaseRenewer:
    """Background heartbeat keeping a claimed task's lease alive."""

    def __init__(self, claim: TaskClaim) -> None:
        self.claim = claim
        self.task_id = claim.task_id
        self.owner = claim.owner
        self.token = claim.token
        self.interval = task_settings.heartbeat_seconds
        self.lost = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"task-lease-{self.task_id}", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def ensure_held(self, session: Session | None = None) -> None:
        if self.lost.is_set():
            raise TaskLeaseLost()
        if session is not None:
            ensure_task_held(session, self.claim)
            return
        # Checkpoints outside the executor transaction (for example before a
        # long provider operation) still use the token and lease fence.  The
        # independent transaction is intentionally committed only after the
        # guarded update succeeds.
        check_session = SessionLocal()
        try:
            ensure_task_held(check_session, self.claim)
            check_session.commit()
        except Exception:
            check_session.rollback()
            self.lost.set()
            raise
        finally:
            check_session.close()

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            try:
                session = SessionLocal()
                try:
                    if not renew_task_lease(session, self.claim):
                        logger.warning("task_lease_lost task_id=%s owner=%s", self.task_id, self.owner)
                        self.lost.set()
                        return
                finally:
                    session.close()
            except SQLAlchemyError:
                # A transient database outage must not drop the lease: retry on
                # the next tick. If the lease truly expires, recovery reclaims
                # the task and this renewer will then notice the loss.
                logger.warning("task_heartbeat_db_error task_id=%s", self.task_id, exc_info=True)
            except Exception:
                logger.warning("task_heartbeat_error task_id=%s", self.task_id, exc_info=True)


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
    now = _utcnow()
    if task.cancel_requested_at is not None:
        task.status = "cancelled"
        task.finished_at = now
        task.lease_owner = None
        task.lease_expires_at = None
        session.commit()
        return

    owner = _owner_identity()
    crash_point("before_claim")
    claim = claim_task(session, task.id, owner)
    if claim is None:
        logger.info("task_claim_skipped task_id=%s owner=%s", task.id, owner)
        return
    task = claim.task
    crash_point("claimed")
    processing_stall()
    renewer = _LeaseRenewer(claim)
    renewer.start()

    def progress(current: int, total: int, message: str) -> None:
        # Progress is telemetry, not a business commit boundary.  Check it in
        # a short independent transaction so it cannot hold the task row lock
        # while a handler is doing work or while the progress session commits.
        # Synchronous execution must stay on the caller's session.  Besides
        # avoiding an unnecessary connection, this is important for tests and
        # embedded callers that inject a database session rather than using
        # SessionLocal.
        renewer.ensure_held(session if not commit_progress else None)
        safe_total = max(1, total)
        values = {
            "progress_current": min(max(0, current), safe_total),
            "progress_total": safe_total,
            "progress_message": message[:255],
            "heartbeat_at": _utcnow(),
        }
        if commit_progress:
            progress_session = SessionLocal()
            try:
                cancellation = progress_session.scalar(select(BackgroundTask.cancel_requested_at).where(BackgroundTask.id == task.id))
                if cancellation is not None:
                    raise TaskCancelled
                guarded = progress_session.execute(update(BackgroundTask).where(
                    BackgroundTask.id == task.id,
                    BackgroundTask.status == "running",
                    BackgroundTask.lease_owner == owner,
                    BackgroundTask.lease_token == claim.token,
                    BackgroundTask.lease_expires_at > func.clock_timestamp(),
                ).values(**values))
                if guarded.rowcount != 1:
                    progress_session.rollback()
                    renewer.lost.set()
                    raise TaskLeaseLost()
                progress_session.commit()
            finally:
                progress_session.close()
        else:
            for key, value in values.items():
                setattr(task, key, value)

    try:
        handler = HANDLERS[task.task_type]
        # Pass the immutable claim handle through the handler so every internal
        # durable commit can fence itself to this exact ownership interval.
        handled = handler(session, claim, progress)
        crash_point("before_task_success")
        renewer.ensure_held(session)
        after_commit = handled.after_commit if isinstance(handled, TaskHandlerResult) else ()
        result = handled.result if isinstance(handled, TaskHandlerResult) else handled
        if commit_progress:
            session.refresh(task, attribute_names=["progress_total"])
        _finalize_success(session, claim, result, task.progress_total)
        clear_rollback_cleanups(session)
        _run_after_commit(after_commit)
    except TaskCancelled:
        session.rollback()
        _run_rollback_cleanups(session)
        cancelled = session.execute(update(BackgroundTask).where(
            BackgroundTask.id == task.id,
            BackgroundTask.status == "running",
            BackgroundTask.lease_owner == owner,
            BackgroundTask.lease_token == claim.token,
            BackgroundTask.lease_expires_at > func.clock_timestamp(),
        ).values(
            status="cancelled", progress_message="Annulé", finished_at=func.now(),
            lease_owner=None, lease_token=None, lease_expires_at=None,
        ))
        if cancelled.rowcount != 1:
            session.rollback()
            raise TaskLeaseLost()
        session.commit()
    except TaskLeaseLost:
        # Another executor reclaimed this task. Do not touch its state: the
        # new owner is responsible for the outcome and any idempotent output.
        session.rollback()
        _run_rollback_cleanups(session)
        logger.warning("task_aborted_lease_lost task_id=%s owner=%s", task.id, owner)
    except HTTPException as error:
        session.rollback()
        _run_rollback_cleanups(session)
        _finalize_failed(session, claim, "invalid_request", str(error.detail))
    except Exception:
        session.rollback()
        _run_rollback_cleanups(session)
        logger.exception("Background task failed task_id=%s type=%s", task.id, task.task_type)
        try:
            session.refresh(task, attribute_names=["attempt_count", "max_attempts"])
        except SQLAlchemyError:
            # If the database itself is unreachable we cannot record a retry; the
            # lease will expire and the recovery supervisor will reclaim the task.
            logger.warning("Unable to refresh task for retry decision task_id=%s", task.id)
        if task.attempt_count < task.max_attempts:
            if _release_for_retry(session, claim):
                if commit_progress:
                    raise
                return
        _finalize_failed(session, claim, "task_failed", "Le traitement a échoué.")
        if commit_progress:
            raise
    finally:
        renewer.stop()
        # State transitions above used guarded bulk UPDATEs that bypass the ORM
        # identity map. Re-sync the instance so callers (and the shared test
        # session) observe the committed status/result instead of stale values.
        try:
            session.refresh(task)
        except SQLAlchemyError:
            logger.warning("Unable to refresh task after execution task_id=%s", task.id, exc_info=True)


def _finalize_success(session: Session, claim_or_task_id: TaskClaim | UUID | BackgroundTask, result_or_owner: dict[str, Any] | str, progress_total_or_result: int | dict[str, Any], legacy_progress_total: int | None = None) -> bool:
    if isinstance(result_or_owner, str):
        task_id, owner, token = _claim_values(session, claim_or_task_id, result_or_owner)
        result = progress_total_or_result
        if not isinstance(result, dict) or legacy_progress_total is None:
            raise TypeError("Invalid legacy task finalization arguments")
        progress_total = legacy_progress_total
    else:
        task_id, owner, token = _claim_values(session, claim_or_task_id)
        result = result_or_owner
        if not isinstance(progress_total_or_result, int):
            raise TypeError("Invalid task finalization progress")
        progress_total = progress_total_or_result
    statement = update(BackgroundTask).where(
        BackgroundTask.id == task_id,
        BackgroundTask.status == "running",
        BackgroundTask.lease_owner == owner,
        BackgroundTask.lease_token == token,
        BackgroundTask.lease_expires_at > func.clock_timestamp(),
    ).values(
        status="succeeded",
        result_json=result,
        progress_current=progress_total,
        progress_message="Terminé",
        error_code=None,
        error_message=None,
        finished_at=func.now(),
        lease_owner=None,
        lease_token=None,
        lease_expires_at=None,
    )
    outcome = session.execute(statement)
    if outcome.rowcount != 1:
        session.rollback()
        raise TaskLeaseLost()
    session.commit()
    return True


def _finalize_failed(session: Session, claim_or_task_id: TaskClaim | UUID | BackgroundTask, code_or_owner: str, message_or_code: str, legacy_message: str | None = None) -> bool:
    if legacy_message is None:
        task_id, owner, token = _claim_values(session, claim_or_task_id)
        code, message = code_or_owner, message_or_code
    else:
        task_id, owner, token = _claim_values(session, claim_or_task_id, code_or_owner)
        code, message = message_or_code, legacy_message
    statement = update(BackgroundTask).where(
        BackgroundTask.id == task_id,
        BackgroundTask.status == "running",
        BackgroundTask.lease_owner == owner,
        BackgroundTask.lease_token == token,
        BackgroundTask.lease_expires_at > func.clock_timestamp(),
    ).values(
        status="failed", error_code=code, error_message=message,
        progress_message="Traitement interrompu", finished_at=func.now(),
        lease_owner=None, lease_token=None, lease_expires_at=None,
    )
    outcome = session.execute(statement)
    if outcome.rowcount != 1:
        session.rollback()
        raise TaskLeaseLost()
    session.commit()
    return True


def _release_for_retry(session: Session, claim_or_task_id: TaskClaim | UUID | BackgroundTask, legacy_owner: str | None = None) -> bool:
    task_id, owner, token = _claim_values(session, claim_or_task_id, legacy_owner)
    statement = update(BackgroundTask).where(
        BackgroundTask.id == task_id,
        BackgroundTask.status == "running",
        BackgroundTask.lease_owner == owner,
        BackgroundTask.lease_token == token,
        BackgroundTask.lease_expires_at > func.clock_timestamp(),
        BackgroundTask.attempt_count < BackgroundTask.max_attempts,
    ).values(
        status="pending",
        lease_owner=None, lease_token=None,
        lease_expires_at=None,
        error_code="retry_scheduled",
        error_message="Une nouvelle tentative est planifiée.",
        progress_message="Nouvelle tentative planifiée",
    )
    outcome = session.execute(statement)
    if outcome.rowcount != 1:
        session.rollback()
        raise TaskLeaseLost()
    session.commit()
    logger.info("task_retry_scheduled task_id=%s", task_id)
    return True


def cancel_task(session: Session, task: BackgroundTask) -> BackgroundTask:
    if task.status in TERMINAL_STATUSES:
        return task
    now = _utcnow()
    task.cancel_requested_at = now
    if task.status == "pending":
        task.status = "cancelled"
        task.finished_at = now
        task.progress_message = "Annulé"
        task.lease_owner = None
        task.lease_token = None
        task.lease_expires_at = None
    session.commit()
    if task_settings.mode == "redis":
        try:
            Queue(task_settings.queue_name, connection=Redis.from_url(task_settings.redis_url)).remove(str(task.id))
        except Exception:
            logger.warning("Unable to remove cancelled task from Redis task_id=%s", task.id, exc_info=True)
    return task
