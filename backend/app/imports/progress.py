"""In-process progress tracking for long KMZ confirmations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import Lock, Thread
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.database import SessionLocal
from app.imports.schemas import KmzConfirmRequest, KmzImportProgressRead, KmzImportReport
from app.imports.service import CachedKmzImport, confirm_import


logger = logging.getLogger(__name__)
JOB_TTL = timedelta(hours=1)


@dataclass
class KmzImportJob:
    job_id: UUID
    map_id: UUID
    user_id: UUID
    created_at: datetime
    status: str = "pending"
    completed: int = 0
    total: int = 1
    message: str = "Import en attente"
    report: KmzImportReport | None = None
    error: str | None = None


_jobs: dict[UUID, KmzImportJob] = {}
_jobs_lock = Lock()


def start_import_job(
    map_id: UUID,
    user_id: UUID,
    cached: CachedKmzImport,
    request: KmzConfirmRequest,
) -> KmzImportJob:
    _purge_jobs()
    job = KmzImportJob(job_id=uuid4(), map_id=map_id, user_id=user_id, created_at=datetime.now(UTC))
    with _jobs_lock:
        _jobs[job.job_id] = job
    Thread(
        target=_run_import_job,
        args=(job.job_id, map_id, cached, request),
        name=f"kmz-import-{job.job_id}",
        daemon=True,
    ).start()
    return job


def get_import_job(job_id: UUID, map_id: UUID, user_id: UUID) -> KmzImportJob:
    _purge_jobs()
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None or job.map_id != map_id or job.user_id != user_id:
        raise HTTPException(status_code=404, detail="KMZ import progress was not found")
    return job


def job_to_read(job: KmzImportJob) -> KmzImportProgressRead:
    with _jobs_lock:
        total = max(1, job.total)
        completed = min(job.completed, total)
        return KmzImportProgressRead(
            job_id=job.job_id,
            status=job.status,  # type: ignore[arg-type]
            completed=completed,
            total=total,
            percent=round(completed * 100 / total),
            message=job.message,
            report=job.report,
            error=job.error,
        )


def _run_import_job(
    job_id: UUID,
    map_id: UUID,
    cached: CachedKmzImport,
    request: KmzConfirmRequest,
) -> None:
    def update(completed: int, total: int, message: str) -> None:
        with _jobs_lock:
            job = _jobs[job_id]
            job.status = "running"
            job.completed = completed
            job.total = max(1, total)
            job.message = message

    database_session = SessionLocal()
    try:
        report = confirm_import(
            database_session,
            map_id,
            cached,
            request.selected_source_indexes,
            download_remote_images=request.download_remote_images,
            force_indexes=request.force_source_indexes,
            progress_callback=update,
        )
        with _jobs_lock:
            job = _jobs[job_id]
            job.status = "completed"
            job.completed = job.total
            job.message = "Import terminé"
            job.report = report
    except HTTPException as error:
        _fail_job(job_id, str(error.detail))
    except Exception:
        logger.exception("Asynchronous KMZ import failed for map_id=%s job_id=%s", map_id, job_id)
        _fail_job(job_id, "L’import KMZ a échoué")
    finally:
        database_session.close()


def _fail_job(job_id: UUID, message: str) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job.status = "failed"
        job.message = "Import interrompu"
        job.error = message


def _purge_jobs() -> None:
    cutoff = datetime.now(UTC) - JOB_TTL
    with _jobs_lock:
        for job_id, job in list(_jobs.items()):
            if job.created_at < cutoff:
                _jobs.pop(job_id, None)
