from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import logging
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.photos.models import Photo
from app.photos.reconciliation import (
    active_storage_backend,
    acquire_storage_identity_lock,
    confirm_storage_write,
    enqueue_delete_intent,
    expedite_storage_write_cleanup,
    prepare_storage_write_cleanup,
    process_storage_operations_best_effort,
    thumbnail_object_key,
    versioned_media_object_key,
)
from app.photos.storage import PhotoFileNotFoundError, PhotoStorageError, persist_materialized_photo, resolve_photo_file
from app.media.settings import get_max_image_dimension
from app.tasks.models import BackgroundTask
from app.tasks.registry import ProgressCallback, task_handler
from app.tasks.service import TaskClaim, ensure_task_held

logger = logging.getLogger(__name__)

MEDIA_OPTIMIZATION_TASK = "media_optimization"


def _require_current_admin(
    session: Session,
    user_id: UUID | None,
    *,
    lock: bool = False,
) -> None:
    """Reload the task requester instead of trusting enqueue-time role data."""
    if user_id is None:
        # Direct calls from older internal/unit-test callers do not represent a
        # submitted task. Real task execution always carries a requester.
        return
    query = select(User).where(
        User.id == user_id,
        User.is_admin.is_(True),
        User.is_active.is_(True),
        User.deleted_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    if session.scalar(query.execution_options(populate_existing=True)) is None:
        raise HTTPException(status_code=403, detail="The requesting administrator is no longer active")


def _already_optimized(photo: Photo, max_dimension: int) -> bool:
    """True when a photo is already in the optimization target state.

    WebP encoding at a fixed quality is lossy, so re-encoding an artifact that
    was already optimized (for example after a crash-recovery retry) would
    degrade it further without any benefit. A photo that is already WebP and
    already within the maximum dimension is in the target state; skipping it
    makes the optimization idempotent across retries. Oversized WebP files are
    still processed so they can be downscaled.
    """
    return (
        photo.mime_type == "image/webp"
        and photo.width is not None
        and photo.height is not None
        and photo.width <= max_dimension
        and photo.height <= max_dimension
    )


class OptimizationSourceChanged(Exception):
    """The photo changed while an optimized candidate was being prepared."""


def _photo_source_snapshot(photo: Photo) -> tuple:
    return (
        photo.path,
        photo.storage_scope_id,
        photo.file_size_bytes,
        photo.width,
        photo.height,
        photo.mime_type,
        photo.storage_state,
    )


def _activate_optimized_photo(
    session: Session,
    *,
    claim: TaskClaim | None,
    requester_id: UUID | None,
    photo_id: UUID,
    source_snapshot: tuple,
    source_digest: str,
    new_path: str,
    new_size: int,
    width: int,
    height: int,
) -> list[UUID]:
    """Atomically activate a prepared object under task/admin/source fences."""
    if claim is not None:
        ensure_task_held(session, claim)
    _require_current_admin(session, requester_id, lock=True)

    source_path = source_snapshot[0]
    if source_path is None:
        raise OptimizationSourceChanged()
    backend = active_storage_backend("media")
    # Deep reconciliation acquires storage identity locks before metadata row
    # locks. Use the same order, and a stable order for the two identities.
    for object_key in sorted({source_path, new_path}):
        acquire_storage_identity_lock(
            session,
            backend=backend,
            namespace="media",
            object_key=object_key,
        )
    current = session.scalar(
        select(Photo)
        .where(Photo.id == photo_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if current is None or _photo_source_snapshot(current) != source_snapshot:
        raise OptimizationSourceChanged()
    current_source = resolve_photo_file(
        current.path,
        current.storage_scope_id,
        current.id,
        require_file=True,
    )
    if sha256(current_source.read_bytes()).hexdigest() != source_digest:
        raise OptimizationSourceChanged()

    current.path = new_path
    current.filename = new_path.rsplit("/", 1)[-1]
    current.mime_type = "image/webp"
    current.file_size_bytes = new_size
    current.width = width
    current.height = height
    current.storage_state = "available"
    current.storage_checked_at = datetime.now(UTC).replace(tzinfo=None)
    return [
        enqueue_delete_intent(
            session,
            backend=backend,
            namespace="media",
            object_key=thumbnail_object_key(photo_id),
            purpose="thumbnail_refresh",
            acquire_lock=False,
        ),
        enqueue_delete_intent(
            session,
            backend=backend,
            namespace="media",
            object_key=source_path,
            purpose="optimization_replaced_original",
            acquire_lock=False,
        ),
    ]


def _abandon_prepared_write(session: Session, operation_id: UUID | None) -> None:
    if operation_id is None:
        return
    try:
        expedite_storage_write_cleanup(session, operation_id)
        process_storage_operations_best_effort([operation_id], session=session)
    except Exception:
        session.rollback()
        logger.warning("Unable to clean prepared media optimization output", exc_info=True)


@task_handler(MEDIA_OPTIMIZATION_TASK)
def optimize_existing_media(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict:
    from app.tasks.fault_injection import crash_point

    photos = session.scalars(select(Photo).where(Photo.path.is_not(None)).order_by(Photo.created_at, Photo.id)).all()
    max_dimension = get_max_image_dimension(session)
    total = max(1, len(photos))
    optimized = skipped = failed = saved_bytes = 0
    claim = task if isinstance(task, TaskClaim) else None
    requester_id = getattr(task, "requested_by_user_id", None)
    _require_current_admin(session, requester_id)
    crash_point("media_before_first")

    for index, photo in enumerate(photos, start=1):
        progress(index - 1, total, f"Optimisation de {index}/{len(photos)}")
        if photo.storage_scope_id is None or photo.path is None:
            skipped += 1
            continue
        if _already_optimized(photo, max_dimension):
            skipped += 1
            continue
        write_intent_id = None
        write_activated = False
        source_snapshot = _photo_source_snapshot(photo)
        target = None
        temporary = None
        try:
            source = resolve_photo_file(photo.path, photo.storage_scope_id, photo.id, require_file=True)
            before_size = source.stat().st_size
            source_digest = sha256(source.read_bytes()).hexdigest()
            new_path = versioned_media_object_key(photo.storage_scope_id, photo.id)
            target = source.parent / new_path.rsplit("/", 1)[-1]
            temporary = source.parent / f".{target.name}.partial"
            write_intent_id = prepare_storage_write_cleanup(
                session,
                namespace="media",
                object_key=new_path,
                purpose="optimization_write_cleanup",
                hold_identity_lock=False,
            )
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image)
                image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                image.save(temporary, format="WEBP", quality=84, method=6)
                width, height = image.size
            temporary.replace(target)
            persist_materialized_photo(new_path, target, "image/webp")
            crash_point("media_after_file_persist")
            deletion_ids = _activate_optimized_photo(
                session,
                claim=claim,
                requester_id=requester_id,
                photo_id=photo.id,
                source_snapshot=source_snapshot,
                source_digest=source_digest,
                new_path=new_path,
                new_size=target.stat().st_size,
                width=width,
                height=height,
            )
            confirm_storage_write(session, write_intent_id)
            session.commit()
            write_activated = True
            process_storage_operations_best_effort(deletion_ids, session=session)
            optimized += 1
            saved_bytes += max(0, before_size - target.stat().st_size)
        except OptimizationSourceChanged:
            session.rollback()
            _abandon_prepared_write(session, write_intent_id)
            skipped += 1
        except HTTPException:
            session.rollback()
            if not write_activated:
                _abandon_prepared_write(session, write_intent_id)
            raise
        except (PhotoFileNotFoundError, UnidentifiedImageError, PhotoStorageError, OSError, ValueError):
            failed += 1
            session.rollback()
            if not write_activated:
                _abandon_prepared_write(session, write_intent_id)
            # Most failures happen while reading or transforming a file.  Do not
            # roll back the whole task here: that would discard metadata updates
            # for every photo processed since the preceding progress commit.
        except Exception:
            session.rollback()
            if not write_activated:
                _abandon_prepared_write(session, write_intent_id)
            raise
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        if index % 10 == 0:
            _require_current_admin(session, requester_id, lock=True)
            if claim is not None:
                ensure_task_held(session, claim)
            session.commit()
            crash_point("media_after_batch_commit")
    if claim is not None:
        _require_current_admin(session, requester_id, lock=True)
        ensure_task_held(session, claim)
    else:
        _require_current_admin(session, requester_id, lock=True)
    session.commit()
    progress(total, total, "Optimisation terminée")
    return {"total": len(photos), "optimized": optimized, "skipped": skipped, "failed": failed, "saved_bytes": saved_bytes}
