from __future__ import annotations

import threading
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session

import app.tasks.handlers as handlers
from app.auth.models import User
from app.countries.models import Country
from app.exports import temporary_exports
from app.maps.models import PoiMap
from app.tasks.handlers import TRIP_PDF_TASK
from app.tasks.models import BackgroundTask, GeneratedExport
from app.config import task_settings
from app.tasks.recovery import run_recovery_cycle
from app.tasks.service import (
    TaskLeaseLost,
    _finalize_failed,
    _finalize_success,
    _release_for_retry,
    claim_task,
    ensure_task_held,
    renew_task_lease,
    rq_retry_policy,
)


pytestmark = pytest.mark.integration


def _now() -> datetime:
    return datetime.now(UTC)


def _future(seconds: int = 3600) -> datetime:
    return _now() + timedelta(seconds=seconds)


def _past(seconds: int = 300) -> datetime:
    return _now() - timedelta(seconds=seconds)


def _make_task(user_id, **overrides) -> BackgroundTask:
    defaults = {
        "task_type": TRIP_PDF_TASK,
        "requested_by_user_id": user_id,
        "status": "pending",
        "progress_current": 0,
        "progress_total": 1,
        "progress_message": "En attente",
        "input_json": {},
        "attempt_count": 0,
        "max_attempts": 3,
        "created_at": _now(),
        "expires_at": _future(),
    }
    defaults.update(overrides)
    return BackgroundTask(**defaults)


def _persist_recovery_prerequisites(test_engine, *, with_map: bool = False) -> tuple:
    user_id = uuid4()
    map_id = uuid4() if with_map else None
    with test_engine.begin() as connection:
        connection.execute(User.__table__.insert().values(
            id=user_id,
            email=f"recovery-{user_id}@example.test",
            display_name="Recovery test user",
            password_hash="test-only-not-a-real-password-hash",
            is_admin=True,
            is_active=True,
        ))
        if map_id is not None:
            country_id = connection.scalar(select(Country.id).where(Country.iso_alpha3 == "FRA"))
            connection.execute(PoiMap.__table__.insert().values(
                id=map_id,
                name="Recovery test map",
                country_id=country_id,
                owner_id=user_id,
                is_private=True,
            ))
    return user_id, map_id


def test_rq_retry_policy_is_delivery_only() -> None:
    # RES-006: retries are DB-driven through the recovery supervisor; RQ is a
    # delivery-only mechanism. No Retry object is ever constructed, so the
    # invalid Retry(max=0) that broke max_attempts=1 enqueueing cannot occur.
    assert rq_retry_policy(0) is None
    assert rq_retry_policy(1) is None
    assert rq_retry_policy(2) is None
    assert rq_retry_policy(3) is None


def test_claim_is_atomic_and_lease_protected(database_session, auth_user) -> None:
    task = _make_task(auth_user.id)
    database_session.add(task)
    database_session.commit()

    first = claim_task(database_session, task.id, "owner-a")
    assert first is not None
    assert first.status == "running"
    assert first.attempt_count == 1
    assert first.lease_owner == "owner-a"
    assert first.lease_expires_at is not None
    assert first.token is not None

    # A valid lease cannot be stolen by a second executor.
    second = claim_task(database_session, task.id, "owner-b")
    assert second is None
    database_session.refresh(task)
    assert task.lease_owner == "owner-a"
    assert task.attempt_count == 1

    # Once the lease expires the task becomes recoverable and the attempt count
    # increments, making the retry observable.
    task.lease_expires_at = _past(10)
    database_session.commit()
    third = claim_task(database_session, task.id, "owner-b")
    assert third is not None
    assert third.attempt_count == 2
    assert third.lease_owner == "owner-b"
    assert third.token != first.token


def test_stale_claim_cannot_heartbeat_or_finalize_and_rolls_back(
    database_session, auth_user
) -> None:
    task = _make_task(auth_user.id)
    database_session.add(task)
    database_session.commit()

    stale = claim_task(database_session, task.id, "owner-a")
    assert stale is not None
    task.lease_expires_at = _past(10)
    database_session.commit()
    current = claim_task(database_session, task.id, "owner-b")
    assert current is not None

    task.progress_message = "stale mutation"
    with pytest.raises(TaskLeaseLost):
        ensure_task_held(database_session, stale)
    database_session.refresh(task)
    assert task.progress_message != "stale mutation"
    assert task.lease_owner == "owner-b"

    with pytest.raises(TaskLeaseLost):
        _finalize_success(database_session, stale, {"stale": True}, 1)
    database_session.refresh(task)
    assert task.status == "running"
    assert task.lease_owner == "owner-b"


def test_claim_refuses_when_attempts_exhausted(database_session, auth_user) -> None:
    task = _make_task(auth_user.id, max_attempts=2, attempt_count=2, status="running", lease_expires_at=_past(10))
    database_session.add(task)
    database_session.commit()

    assert claim_task(database_session, task.id, "owner-a") is None


def test_retry_release_is_fenced_and_preserves_attempt_budget(database_session, auth_user) -> None:
    task = _make_task(auth_user.id, max_attempts=2)
    database_session.add(task)
    database_session.commit()

    first = claim_task(database_session, task.id, "owner-a")
    assert first is not None
    assert _release_for_retry(database_session, first)
    database_session.refresh(task)
    assert task.status == "pending"
    assert task.attempt_count == 1
    assert task.lease_token is None

    second = claim_task(database_session, task.id, "owner-b")
    assert second is not None
    assert second.attempt_count == 2
    assert second.token != first.token
    with pytest.raises(TaskLeaseLost):
        _release_for_retry(database_session, second)
    database_session.refresh(task)
    assert task.status == "running"
    assert task.lease_owner == "owner-b"
    assert claim_task(database_session, task.id, "owner-c") is None


def test_recovery_cycle_dispatches_stale_and_fails_exhausted(database_session, auth_user) -> None:
    stale_running = _make_task(auth_user.id, status="running", lease_owner="dead-worker", lease_expires_at=_past(10), attempt_count=1)
    orphaned_pending = _make_task(auth_user.id, status="pending", created_at=_past(300), attempt_count=0)
    exhausted = _make_task(auth_user.id, status="running", lease_owner="dead-worker", lease_expires_at=_past(10), attempt_count=3, max_attempts=3)
    healthy = _make_task(auth_user.id, status="running", lease_owner="live-worker", lease_expires_at=_future(600), attempt_count=1)
    fresh_pending = _make_task(auth_user.id, status="pending", created_at=_now(), attempt_count=0)
    database_session.add_all([stale_running, orphaned_pending, exhausted, healthy, fresh_pending])
    database_session.commit()

    dispatched: list[str] = []

    def dispatch(task_id: str) -> bool:
        dispatched.append(task_id)
        return True

    redispatched, failed, skipped = run_recovery_cycle(database_session, dispatch)

    assert str(stale_running.id) in dispatched
    assert str(orphaned_pending.id) in dispatched
    assert str(healthy.id) not in dispatched
    assert str(fresh_pending.id) not in dispatched
    assert redispatched == 2
    assert failed == 1
    assert skipped == 0

    database_session.refresh(exhausted)
    assert exhausted.status == "failed"
    assert exhausted.error_code == "worker_interrupted"


def test_recovery_terminalizes_expired_and_legacy_exhausted_running_tasks(
    database_session, auth_user
) -> None:
    expired = _make_task(
        auth_user.id,
        status="running",
        lease_owner="dead-worker",
        lease_expires_at=_past(10),
        attempt_count=1,
        max_attempts=3,
        expires_at=_past(10),
    )
    legacy = _make_task(
        auth_user.id,
        status="running",
        lease_owner=None,
        lease_token=None,
        lease_expires_at=None,
        heartbeat_at=_past(7200),
        started_at=_past(7200),
        attempt_count=2,
        max_attempts=2,
    )
    database_session.add_all([expired, legacy])
    database_session.commit()

    dispatched: list[str] = []
    result = run_recovery_cycle(database_session, lambda task_id: dispatched.append(task_id) or True)

    assert result == (0, 2, 0)
    assert dispatched == []
    for task in (expired, legacy):
        database_session.refresh(task)
        assert task.status == "failed"
        assert task.error_code == "worker_interrupted"
        assert task.lease_owner is None
        assert task.lease_token is None
        assert task.lease_expires_at is None


def test_recovery_prioritizes_exhausted_tasks_when_batch_is_small(database_session, auth_user) -> None:
    recoverable = _make_task(
        auth_user.id,
        status="running",
        lease_owner="dead-worker",
        lease_expires_at=_past(10),
        attempt_count=1,
        max_attempts=2,
        created_at=_past(300),
    )
    exhausted = _make_task(
        auth_user.id,
        status="running",
        lease_owner="dead-worker",
        lease_expires_at=_past(10),
        attempt_count=2,
        max_attempts=2,
        created_at=_past(10),
    )
    database_session.add_all([recoverable, exhausted])
    database_session.commit()
    original_batch_size = task_settings.recovery_batch_size
    object.__setattr__(task_settings, "recovery_batch_size", 1)
    try:
        dispatched: list[str] = []
        result = run_recovery_cycle(database_session, lambda task_id: dispatched.append(task_id) or True)
    finally:
        object.__setattr__(task_settings, "recovery_batch_size", original_batch_size)

    assert result == (0, 1, 0)
    assert dispatched == []
    database_session.refresh(exhausted)
    assert exhausted.status == "failed"
    database_session.refresh(recoverable)
    assert recoverable.status == "running"


def test_dedup_returns_active_task_and_recovers_stale_task(database_session, auth_user) -> None:
    from app.tasks.service import create_task

    # An actively-owned running task is returned as-is (deduplication honoured).
    active = create_task(
        database_session, task_type=TRIP_PDF_TASK, user_id=auth_user.id, map_id=None,
        dedupe_key="dedup-active", input_json={},
    )
    database_session.commit()
    claimed = claim_task(database_session, active.id, "owner-a")
    assert claimed is not None

    duplicate = create_task(
        database_session, task_type=TRIP_PDF_TASK, user_id=auth_user.id, map_id=None,
        dedupe_key="dedup-active", input_json={},
    )
    assert duplicate.id == active.id
    database_session.refresh(active)
    assert active.status == "running"

    # A stale duplicate must be reset for recovery, not returned as healthy work.
    active.lease_expires_at = _past(10)
    database_session.commit()
    recovered = create_task(
        database_session, task_type=TRIP_PDF_TASK, user_id=auth_user.id, map_id=None,
        dedupe_key="dedup-active", input_json={},
    )
    assert recovered.id == active.id
    database_session.refresh(active)
    assert active.status == "pending"
    assert active.error_code == "worker_interrupted"


def test_resubmission_after_terminal_failure_creates_new_task(database_session, auth_user) -> None:
    from app.tasks.service import create_task

    failed_task = create_task(
        database_session, task_type=TRIP_PDF_TASK, user_id=auth_user.id, map_id=None,
        dedupe_key="dedup-terminal", input_json={},
    )
    failed_task.status = "failed"
    failed_task.finished_at = _now()
    database_session.commit()

    retry = create_task(
        database_session, task_type=TRIP_PDF_TASK, user_id=auth_user.id, map_id=None,
        dedupe_key="dedup-terminal", input_json={},
    )
    assert retry.id != failed_task.id


def test_idempotent_pdf_finalization_reuses_canonical_output(
    database_session, auth_user, poi_map, tmp_path, monkeypatch
) -> None:
    # Mandatory scenario: a previous attempt committed the canonical output and
    # then crashed, leaving the task running/stale. Recovery must reuse the
    # existing export (no second export, no duplicate row) and reach succeeded.
    monkeypatch.setattr(temporary_exports, "EXPORT_ROOT", tmp_path)
    trip_id = uuid4()

    task = _make_task(
        auth_user.id, status="running", resource_type="trip", resource_id=trip_id,
        attempt_count=1, max_attempts=2, lease_owner="dead-worker", lease_expires_at=_past(10),
    )
    database_session.add(task)
    database_session.flush()

    storage_name = f"{uuid4()}.pdf"
    (tmp_path / storage_name).write_bytes(b"%PDF-1.4 canonical")
    export = GeneratedExport(
        map_id=poi_map.id, user_id=auth_user.id, task_id=task.id,
        storage_name=storage_name, file_name="carnet.pdf",
        media_type="application/pdf", expires_at=_future(900),
    )
    database_session.add(export)
    database_session.commit()

    monkeypatch.setattr(handlers, "_active_user", lambda session, user_id: auth_user)
    monkeypatch.setattr(
        handlers, "require_trip_viewer",
        lambda session, resource_id, user: SimpleNamespace(trip=SimpleNamespace(id=resource_id)),
    )

    recovered = claim_task(database_session, task.id, "recoverer")
    assert recovered is not None
    assert recovered.attempt_count == 2

    result = handlers.handle_trip_pdf(database_session, recovered, lambda current, total, message: None)
    assert result["export_id"] == str(export.id)

    output_count = database_session.scalar(
        select(func.count()).select_from(GeneratedExport).where(GeneratedExport.task_id == task.id)
    )
    assert output_count == 1

    assert _finalize_success(database_session, task.id, "recoverer", result, 3)
    database_session.refresh(task)
    assert task.status == "succeeded"
    assert task.result_json["export_id"] == str(export.id)


def test_concurrent_claims_have_exactly_one_winner(test_engine) -> None:
    email = f"race-{uuid4()}@example.test"
    with test_engine.begin() as connection:
        user_id = connection.execute(text(
            "INSERT INTO users (email, display_name, password_hash, is_active) "
            "VALUES (:email, 'Race owner', 'test-only', true) RETURNING id"
        ), {"email": email}).scalar()
        task_id = connection.execute(text(
            "INSERT INTO background_tasks "
            "(task_type, requested_by_user_id, status, attempt_count, max_attempts, "
            " lease_owner, lease_expires_at, expires_at) "
            "VALUES (:task_type, :user_id, 'running', 1, 3, 'dead-worker', now() - interval '10 seconds', "
            " now() + interval '1 hour') RETURNING id"
        ), {"task_type": TRIP_PDF_TASK, "user_id": user_id}).scalar()

    winners: list[str] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(5)

    def attempt_claim(index: int) -> None:
        try:
            barrier.wait(timeout=15)
        except threading.BrokenBarrierError:
            return
        try:
            with Session(test_engine) as session:
                claimed = claim_task(session, task_id, f"racer-{index}")
                if claimed is not None:
                    winners.append(claimed.lease_owner)
        except BaseException as error:  # noqa: BLE001 - report any thread failure
            errors.append(error)

    threads = [threading.Thread(target=attempt_claim, args=(index,)) for index in range(5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    try:
        assert errors == []
        assert len(winners) == 1
        with Session(test_engine) as session:
            final = session.get(BackgroundTask, task_id)
            assert final is not None
            assert final.attempt_count == 2
            assert final.lease_owner == winners[0]
    finally:
        with test_engine.begin() as connection:
            connection.execute(text("DELETE FROM background_tasks WHERE id = :task_id"), {"task_id": task_id})
            connection.execute(text("DELETE FROM users WHERE id = :user_id"), {"user_id": user_id})


def test_stale_business_transaction_rolls_back_after_takeover(test_engine) -> None:
    """A stale executor cannot commit a mutation after B reclaims the task."""
    user_id, map_id = _persist_recovery_prerequisites(test_engine, with_map=True)
    task = _make_task(user_id, map_id=map_id)
    with Session(test_engine) as setup:
        setup.add(task)
        setup.commit()
        task_id = task.id

    try:
        with Session(test_engine) as session_a, Session(test_engine) as session_b:
            claim_a = claim_task(session_a, task_id, "worker-a")
            assert claim_a is not None

            map_a = session_a.get(PoiMap, map_id)
            assert map_a is not None
            original_name = map_a.name
            map_a.name = "stale executor mutation"

            session_b.execute(update(BackgroundTask).where(BackgroundTask.id == task_id).values(
                lease_expires_at=func.clock_timestamp() - timedelta(seconds=10),
            ))
            session_b.commit()
            claim_b = claim_task(session_b, task_id, "worker-b")
            assert claim_b is not None
            assert claim_b.token != claim_a.token

            with pytest.raises(TaskLeaseLost):
                ensure_task_held(session_a, claim_a)
            with pytest.raises(TaskLeaseLost):
                _finalize_success(session_a, claim_a, {"owner": "a"}, 1)
            with pytest.raises(TaskLeaseLost):
                _finalize_failed(session_a, claim_a, "stale", "stale executor")

            session_b.refresh(claim_b.task)
            assert claim_b.task.status == "running"
            assert claim_b.task.lease_owner == "worker-b"
            ensure_task_held(session_b, claim_b)
            current_map = session_b.get(PoiMap, map_id)
            assert current_map is not None
            current_map.name = "current executor mutation"
            _finalize_success(session_b, claim_b, {"owner": "b"}, 1)

        with Session(test_engine) as verify:
            persisted_map = verify.get(PoiMap, map_id)
            persisted_task = verify.get(BackgroundTask, task_id)
            assert persisted_map is not None and persisted_map.name == "current executor mutation"
            assert original_name != "stale executor mutation"
            assert persisted_task is not None and persisted_task.status == "succeeded"
    finally:
        with test_engine.begin() as connection:
            connection.execute(delete(BackgroundTask).where(BackgroundTask.id == task_id))
            connection.execute(delete(PoiMap).where(PoiMap.id == map_id))
            connection.execute(delete(User).where(User.id == user_id))


def test_stale_heartbeat_cannot_extend_replacement_claim(test_engine) -> None:
    user_id, _ = _persist_recovery_prerequisites(test_engine)
    task = _make_task(user_id)
    with Session(test_engine) as setup:
        setup.add(task)
        setup.commit()
        task_id = task.id

    try:
        with Session(test_engine) as session_a, Session(test_engine) as session_b:
            claim_a = claim_task(session_a, task_id, "worker-a")
            assert claim_a is not None
            session_b.execute(update(BackgroundTask).where(BackgroundTask.id == task_id).values(
                lease_expires_at=func.clock_timestamp() - timedelta(seconds=10),
            ))
            session_b.commit()
            claim_b = claim_task(session_b, task_id, "worker-b")
            assert claim_b is not None
            expiry_b = claim_b.task.lease_expires_at

            assert renew_task_lease(session_a, claim_a) is False

            session_b.expire(claim_b.task)
            session_b.refresh(claim_b.task)
            assert claim_b.task.lease_token == claim_b.token
            assert claim_b.task.lease_expires_at == expiry_b
    finally:
        with test_engine.begin() as connection:
            connection.execute(delete(BackgroundTask).where(BackgroundTask.id == task_id))
            connection.execute(delete(User).where(User.id == user_id))
