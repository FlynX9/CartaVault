from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Thread
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import User
from app.basemaps.vector_catalog import VECTOR_COUNTRY_CATALOG, vector_country_source
from app.basemaps.vector_generation import VECTOR_BASEMAP_TASK, BasemapGenerationError, _check_planetiler_runtime
from app.basemaps.vector_models import VectorBasemap
from app.basemaps.vector_settings import get_vector_basemap_policy
from app.config import vector_basemap_settings
from app.maps.models import PoiMap
from app.tasks.models import BackgroundTask
from app.tasks.service import execute_task


logger = logging.getLogger(__name__)
ACTIVE_STATES = frozenset({"downloading", "generating", "validating", "deleting"})


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


def request_vector_basemap(session: Session, country_code: str, user_id: UUID, *, reason: str, force: bool = False) -> tuple[VectorBasemap | None, BackgroundTask | None]:
    source = vector_country_source(country_code)
    if source is None:
        return None, None
    ensure_catalog_rows(session)
    row = session.scalar(select(VectorBasemap).where(VectorBasemap.country_code == source.country_code).with_for_update())
    assert row is not None
    if row.state in ACTIVE_STATES:
        task = session.get(BackgroundTask, row.task_id) if row.task_id else None
        session.commit()
        return row, task
    if row.state == "ready" and not force:
        session.commit()
        return row, None
    dedupe_key = f"vector-basemap:{source.country_code}"
    existing = session.scalar(select(BackgroundTask).where(
        BackgroundTask.dedupe_key == dedupe_key,
        BackgroundTask.status.in_(("pending", "running")),
    ).order_by(BackgroundTask.created_at.desc()))
    if existing is not None:
        row.task_id = existing.id
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
    row = session.get(VectorBasemap, country_code.upper())
    if not policy.enabled or row is None:
        session.commit()
        return row
    if vector_country_source(country_code) is None:
        session.commit()
        return None
    expected = {
        "map_creation": "on_map_creation",
        "cartavault_use": "on_first_cartavault_use",
        "offline_use": "on_first_offline_use",
    }.get(trigger)
    if expected and policy.preparation_policy == expected and archive_path(row) is None and row.state == "not_installed":
        # A native development server may not include the container-only Java
        # runtime. Do not create a doomed automatic job (or download a large
        # PBF) merely because a user selected the map. Manual Admin installs
        # still report the precise runtime error.
        try:
            _check_planetiler_runtime()
        except BasemapGenerationError:
            session.commit()
            return row
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


def recover_vector_basemap_jobs(session: Session) -> list[UUID]:
    now = datetime.now(UTC).replace(tzinfo=None)
    running = session.scalars(select(VectorBasemap).where(VectorBasemap.state.in_(("downloading", "generating", "validating")))).all()
    for row in running:
        task = session.get(BackgroundTask, row.task_id) if row.task_id else None
        if task is not None and task.status == "pending":
            continue
        row.state = "error"; row.phase = "Interrompu"; row.progress = None
        row.last_error_code = "INTERRUPTED"; row.last_error_message = "La préparation a été interrompue par un arrêt de CartaVault."
        row.generation_finished_at = now
        if task is not None and task.status == "running":
            task.status = "failed"; task.error_code = "INTERRUPTED"; task.error_message = row.last_error_message; task.finished_at = now
    session.commit()
    return list(session.scalars(select(BackgroundTask.id).where(BackgroundTask.task_type == VECTOR_BASEMAP_TASK, BackgroundTask.status == "pending")).all())


def start_pending_vector_basemap_jobs(task_ids: list[UUID]) -> None:
    for task_id in task_ids:
        _spawn(task_id)


def schedule_due_updates(session: Session) -> list[UUID]:
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
        _, task = request_vector_basemap(session, row.country_code, admin.id, reason="automatic_update", force=True)
        if task is not None:
            task_ids.append(task.id)
    return task_ids
