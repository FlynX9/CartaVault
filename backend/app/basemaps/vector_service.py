from __future__ import annotations

import logging
import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Thread
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import User
from app.basemaps.vector_catalog import VECTOR_COUNTRY_CATALOG, vector_country_source
from app.basemaps.vector_generation import VECTOR_BASEMAP_TASK, BasemapGenerationError, _check_planetiler_runtime
from app.basemaps.vector_models import VectorBasemap
from app.basemaps.vector_settings import get_vector_basemap_policy
from app.config import vector_basemap_settings
from app.maps.models import MapMembership, PoiMap
from app.countries.models import Country
from app.tasks.models import BackgroundTask
from app.tasks.service import execute_task


logger = logging.getLogger(__name__)
ACTIVE_STATES = frozenset({"downloading", "generating", "validating", "deleting"})
_OFFLINE_REQUEST_REASONS = frozenset({"offline_use", "cartavault_use"})


def authorize_vector_basemap_request(
    session: Session,
    country_code: str,
    user_id: UUID,
    reason: str,
    *,
    lock: bool = False,
) -> None:
    """Authorize the requester for the particular expensive basemap job.

    Manual and scheduled country-wide generation is instance administration.
    The only non-administrator path is the lazy offline preparation requested
    while using a map: the requester must currently edit a non-deleted map for
    that same country.  This check is deliberately repeated by the executor;
    the task row is not an authorization grant.

    ``lock`` is used immediately before a durable generation commit.  Locking
    the current authority row makes a concurrent demotion or membership change
    wait until that commit, rather than allowing work to commit after the
    authority was revoked.
    """
    user_query = select(User).where(
        User.id == user_id,
        User.is_active.is_(True),
        User.deleted_at.is_(None),
    )
    if lock:
        user_query = user_query.with_for_update()
    user = session.scalar(user_query.execution_options(populate_existing=True))
    if user is None:
        raise HTTPException(status_code=403, detail="The requesting user is no longer active")
    if user.is_admin:
        return
    if reason not in _OFFLINE_REQUEST_REASONS:
        raise HTTPException(status_code=403, detail="Administrator access is required for basemap preparation")

    map_query = (
        select(MapMembership)
        .join(PoiMap, PoiMap.id == MapMembership.map_id)
        .join(Country, Country.id == PoiMap.country_id)
        .where(
            MapMembership.user_id == user_id,
            MapMembership.role.in_(("owner", "editor")),
            PoiMap.deleted_at.is_(None),
            Country.iso_alpha2 == country_code.upper(),
        )
        .limit(1)
    )
    if lock:
        map_query = map_query.with_for_update()
    if session.scalar(map_query) is None:
        raise HTTPException(status_code=403, detail="Editor access is required for this country's basemap")


def archive_path(row: VectorBasemap) -> Path | None:
    # Keep serving the last validated archive while an update is running or
    # after an update failure. The state describes the current job, whereas
    # file_path only ever points at an atomically activated archive.
    if not row.file_path:
        return None
    root = vector_basemap_settings.maps_path.resolve()
    path = (root / row.file_path).resolve()
    return path if root in path.parents and path.is_file() else None


def ensure_catalog_rows(session: Session) -> None:
    existing = {row.country_code: row for row in session.scalars(select(VectorBasemap)).all()}
    for code, source in VECTOR_COUNTRY_CATALOG.items():
        row = existing.get(code)
        if row is None:
            session.add(VectorBasemap(country_code=code, country_name=source.country_name, source_url=source.source_url))
        else:
            row.country_name = source.country_name
            row.source_url = source.source_url
    session.flush()


def _spawn(task_id: UUID) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    Thread(target=execute_task, args=(str(task_id),), name=f"vector-basemap-{task_id}", daemon=True).start()


def request_vector_basemap(
    session: Session,
    country_code: str,
    user_id: UUID,
    *,
    reason: str,
    force: bool = False,
    before_commit: Callable[[], None] | None = None,
) -> tuple[VectorBasemap | None, BackgroundTask | None]:
    source = vector_country_source(country_code)
    if source is None:
        return None, None
    # Hold the current authority through task creation/commit.  A role change
    # that commits first is rejected; one that starts concurrently waits for
    # this enqueue transaction.
    authorize_vector_basemap_request(session, source.country_code, user_id, reason, lock=True)
    ensure_catalog_rows(session)
    row = session.scalar(select(VectorBasemap).where(VectorBasemap.country_code == source.country_code).with_for_update())
    assert row is not None
    if row.state in ACTIVE_STATES:
        task = session.get(BackgroundTask, row.task_id) if row.task_id else None
        if before_commit is not None:
            before_commit()
        session.commit()
        return row, task
    if row.state == "ready" and not force:
        if before_commit is not None:
            before_commit()
        session.commit()
        return row, None
    dedupe_key = f"vector-basemap:{source.country_code}"
    existing = session.scalar(select(BackgroundTask).where(
        BackgroundTask.dedupe_key == dedupe_key,
        BackgroundTask.status.in_(("pending", "running")),
    ).order_by(BackgroundTask.created_at.desc()))
    if existing is not None:
        row.task_id = existing.id
        if before_commit is not None:
            before_commit()
        session.commit()
        return row, existing
    from app.tasks.service import create_task
    try:
        task = create_task(
            session, task_type=VECTOR_BASEMAP_TASK, user_id=user_id, map_id=None,
            resource_type="vector_basemap", input_json={"country_code": source.country_code, "reason": reason, "update": force},
            dedupe_key=dedupe_key, max_attempts=1,
        )
        row.state = "downloading"; row.phase = "En attente"; row.progress = None; row.task_id = task.id
        row.last_error_code = None; row.last_error_message = None
        if before_commit is not None:
            before_commit()
        session.commit()
    except IntegrityError:
        session.rollback()
        task = session.scalar(select(BackgroundTask).where(BackgroundTask.dedupe_key == dedupe_key, BackgroundTask.status.in_(("pending", "running"))).order_by(BackgroundTask.created_at.desc()))
        row = session.get(VectorBasemap, source.country_code)
        return row, task
    _spawn(task.id)
    return row, task


def maybe_prepare_for_policy(session: Session, country_code: str, user_id: UUID, trigger: str) -> VectorBasemap | None:
    policy = get_vector_basemap_policy(session)
    ensure_catalog_rows(session)
    source = vector_country_source(country_code)
    row = session.get(VectorBasemap, country_code.upper())
    if not policy.enabled or row is None:
        session.commit()
        return row
    if source is None:
        session.commit()
        return None
    expected = "on_first_offline_use" if trigger == "offline_use" else None
    if expected and policy.preparation_policy == expected and archive_path(row) is None and row.state == "not_installed":
        authorize_vector_basemap_request(session, source.country_code, user_id, trigger)
        # A native development server may not include the container-only Java
        # runtime. Do not create a doomed automatic job (or download a large
        # PBF) merely because a user selected the map. Manual Admin installs
        # still report the precise runtime error.
        try:
            _check_planetiler_runtime()
        except BasemapGenerationError:
            session.commit()
            return row
        logger.info("[basemap-offline] requesting PMTiles preparation", extra={"country_code": country_code.upper(), "reason": trigger})
        row, _ = request_vector_basemap(session, country_code, user_id, reason=trigger)
    else:
        session.commit()
    return row


def delete_vector_basemap(session: Session, country_code: str) -> int:
    row = session.get(VectorBasemap, country_code.upper())
    if row is None:
        return 0
    if row.state in ACTIVE_STATES:
        raise ValueError("Un traitement est déjà en cours pour ce fond.")
    path = archive_path(row)
    row.state = "deleting"; row.phase = "Suppression"
    session.commit()
    if path is not None:
        path.unlink(missing_ok=True)
    count = session.scalar(select(func.count()).select_from(PoiMap).join(PoiMap.country).where(
        PoiMap.deleted_at.is_(None),
        PoiMap.country.has(iso_alpha2=row.country_code),
    )) or 0
    row.state = "not_installed"; row.phase = None; row.progress = None; row.task_id = None
    row.installed_at = None; row.version = None; row.file_path = None; row.file_size = None
    row.min_zoom = None; row.max_zoom = None; row.schema = None
    row.last_error_code = None; row.last_error_message = None
    row.generation_started_at = None; row.generation_finished_at = None
    session.commit()
    return int(count)


def recover_vector_basemap_jobs(
    session: Session,
    *,
    before_commit: Callable[[], None] | None = None,
) -> list[UUID]:
    now = datetime.now(UTC).replace(tzinfo=None)
    running = session.scalars(select(VectorBasemap).where(VectorBasemap.state.in_(("downloading", "generating", "validating")))).all()
    for row in running:
        task = session.get(BackgroundTask, row.task_id) if row.task_id else None
        # Task recovery owns the lease transition.  In particular, do not turn
        # a running task into a terminal error here: an executor may still be
        # inside a fenced transaction and the generic recovery supervisor must
        # be allowed to reclaim it only after its lease expires.
        if task is not None and task.status in {"pending", "running"}:
            continue
        row.state = "error"; row.phase = "Interrompu"; row.progress = None
        row.last_error_code = "INTERRUPTED"; row.last_error_message = "La préparation a été interrompue par un arrêt de CartaVault."
        row.generation_finished_at = now
        if task is not None and task.status == "running":
            task.status = "failed"; task.error_code = "INTERRUPTED"; task.error_message = row.last_error_message; task.finished_at = now
    if before_commit is not None:
        before_commit()
    session.commit()
    return list(session.scalars(select(BackgroundTask.id).where(BackgroundTask.task_type == VECTOR_BASEMAP_TASK, BackgroundTask.status == "pending")).all())


def start_pending_vector_basemap_jobs(task_ids: list[UUID]) -> None:
    for task_id in task_ids:
        _spawn(task_id)


def schedule_due_updates(
    session: Session,
    *,
    before_commit: Callable[[], None] | None = None,
) -> list[UUID]:
    policy = get_vector_basemap_policy(session)
    if policy.update_policy == "disabled":
        return []
    months = 1 if policy.update_policy == "monthly" else 3
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=31 * months)
    admin = session.scalar(select(User).where(User.is_admin.is_(True), User.is_active.is_(True), User.deleted_at.is_(None)).order_by(User.created_at))
    if admin is None:
        return []
    task_ids: list[UUID] = []
    for row in session.scalars(select(VectorBasemap).where(VectorBasemap.state == "ready", VectorBasemap.installed_at < cutoff)).all():
        _, task = request_vector_basemap(
            session,
            row.country_code,
            admin.id,
            reason="automatic_update",
            force=True,
            before_commit=before_commit,
        )
        if task is not None:
            task_ids.append(task.id)
    return task_ids
