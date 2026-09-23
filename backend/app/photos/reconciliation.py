"""Durable storage cleanup and bounded metadata reconciliation.

Storage intents contain only backend/object identity. Provider credentials stay
in process configuration and are resolved only when an operation is executed.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath
from typing import Callable
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from botocore.exceptions import BotoCoreError, ClientError

from app.auth.avatar_storage import avatar_root
from app.auth.models import User
from app.config import storage_reconciliation_settings
from app.database import SessionLocal
from app.photos.models import Photo, StorageOperation
from app.photos.object_storage import (
    LocalObjectStorage,
    ObjectStorageBackend,
    ObjectStorageError,
    StorageObject,
    build_object_storage,
    media_storage_mode,
)
from app.trips.models import TripNightPhoto


logger = logging.getLogger(__name__)
SessionFactory = Callable[[], Session]
ALLOWED_MEDIA_EXTENSIONS = {".jpg", ".png", ".webp"}
MEDIA_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_DOWNLOAD_TOKEN = re.compile(r"^[0-9a-f]{32}$")
_VERSION_TOKEN = re.compile(r"^[0-9a-f]{32}$")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _safe_key_parts(namespace: str, object_key: str) -> PurePosixPath:
    path = PurePosixPath(object_key)
    if namespace not in {"media", "avatar"}:
        raise ValueError("Storage namespace must be media or avatar")
    if (
        not object_key
        or len(object_key) > 1024
        or "\\" in object_key
        or path.is_absolute()
        or path.as_posix() != object_key
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ValueError("Storage object key is invalid")
    return path


def canonical_media_object_key(scope_id: UUID, object_id: UUID, content_type: str) -> str:
    extension = MEDIA_TYPE_EXTENSIONS.get(content_type)
    if extension is None:
        raise ValueError("Unsupported media content type")
    return PurePosixPath(str(scope_id), f"{object_id}{extension}").as_posix()


def versioned_media_object_key(scope_id: UUID, object_id: UUID) -> str:
    """Return a fresh canonical key that cannot overwrite the current object."""

    return PurePosixPath(str(scope_id), f"{object_id}.{uuid4().hex}.webp").as_posix()


def thumbnail_object_key(photo_id: UUID) -> str:
    return PurePosixPath(".thumbnails", f"{photo_id}.webp").as_posix()


def _media_temp_kind(key: str) -> str | None:
    path = PurePosixPath(key)
    if len(path.parts) != 2:
        return None
    directory, name = path.parts
    if directory == ".thumbnails":
        if path.suffix == ".partial":
            try:
                photo_id = UUID(path.stem)
            except ValueError:
                return None
            return "thumbnail_temp" if name == f"{photo_id}.partial" else None
        return None
    try:
        scope_id = UUID(directory)
    except ValueError:
        return None
    if str(scope_id) != directory:
        return None
    # Upload partial: .{media UUID}.{allowed ext}.partial
    if name.startswith(".") and name.endswith(".partial"):
        inner = name[1:-len(".partial")]
        inner_path = PurePosixPath(inner)
        if inner_path.suffix in ALLOWED_MEDIA_EXTENSIONS:
            try:
                object_id = UUID(inner_path.stem)
            except ValueError:
                return None
            if inner == f"{object_id}{inner_path.suffix}":
                return "upload_temp"
    # Versioned optimizer output: .{media UUID}.{32 hex}.webp.partial
    if name.startswith(".") and name.endswith(".webp.partial"):
        versioned = _canonical_original(
            PurePosixPath(directory, name[1:-len(".partial")]).as_posix()
        )
        if versioned is not None:
            return "optimization_temp"
    # Optimizer WebP partial: {media UUID}.partial
    if path.suffix == ".partial":
        try:
            object_id = UUID(path.stem)
        except ValueError:
            return None
        if name == f"{object_id}.partial":
            return "optimization_temp"
    # Resizer temp: {media UUID}.{allowed ext}.resizing
    if name.endswith(".resizing"):
        inner_path = PurePosixPath(name[:-len(".resizing")])
        if inner_path.suffix in ALLOWED_MEDIA_EXTENSIONS:
            try:
                object_id = UUID(inner_path.stem)
            except ValueError:
                return None
            if inner_path.as_posix() == f"{object_id}{inner_path.suffix}":
                return "resize_temp"
    # S3 materialization temp: .{name}.{32 hex}.download
    if name.startswith(".") and name.endswith(".download"):
        inner = name[1:-len(".download")]
        base, separator, token = inner.rpartition(".")
        base_path = PurePosixPath(base)
        if separator and _DOWNLOAD_TOKEN.fullmatch(token) and base_path.suffix in ALLOWED_MEDIA_EXTENSIONS:
            try:
                object_id = UUID(base_path.stem)
            except ValueError:
                return None
            if base == f"{object_id}{base_path.suffix}":
                return "download_temp"
    return None


def _canonical_avatar(key: str) -> UUID | None:
    path = PurePosixPath(key)
    if len(path.parts) != 1 or path.suffix != ".webp":
        return None
    try:
        avatar_id = UUID(path.stem)
    except ValueError:
        return None
    return avatar_id if key == f"{avatar_id}.webp" else None


def _avatar_temp_kind(key: str) -> str | None:
    path = PurePosixPath(key)
    if len(path.parts) != 1 or not key.startswith(".") or not key.endswith(".webp.partial"):
        return None
    try:
        avatar_id = UUID(key[1:-len(".webp.partial")])
    except ValueError:
        return None
    return "avatar_temp" if key == f".{avatar_id}.webp.partial" else None


def validate_storage_identity(namespace: str, object_key: str) -> None:
    _safe_key_parts(namespace, object_key)
    if namespace == "media":
        if (
            _canonical_original(object_key) is None
            and _thumbnail_id(object_key) is None
            and _media_temp_kind(object_key) is None
        ):
            raise ValueError("Storage media object key is not a recognized CartaVault identity")
    elif _canonical_avatar(object_key) is None and _avatar_temp_kind(object_key) is None:
        raise ValueError("Storage avatar object key is not a recognized CartaVault identity")


def acquire_storage_identity_lock(
    session: Session,
    *,
    backend: str,
    namespace: str,
    object_key: str,
) -> None:
    """Serialize blob writes/deletes for one identity for this transaction."""

    validate_storage_identity(namespace, object_key)
    identity = f"cartavault:storage:v1:{backend}:{namespace}:{object_key}"
    session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(identity, 0))))


def active_storage_backend(namespace: str) -> str:
    return "local" if namespace == "avatar" else media_storage_mode()


def _backend(namespace: str) -> ObjectStorageBackend:
    if namespace == "avatar":
        return LocalObjectStorage(avatar_root())
    return build_object_storage()


def enqueue_delete_intent(
    session: Session,
    *,
    backend: str,
    namespace: str,
    object_key: str,
    purpose: str,
    acquire_lock: bool = True,
) -> UUID:
    """Add or return the durable identity for one actionable deletion."""

    if backend not in {"local", "s3"}:
        raise ValueError("Storage backend must be local or s3")
    validate_storage_identity(namespace, object_key)
    if not purpose or len(purpose) > 64:
        raise ValueError("Storage operation purpose is invalid")
    if acquire_lock:
        # Keep the identity lock before the operation-row write. Writers hold
        # this lock before making their intent durable; reversing the order
        # here could deadlock a repair that discovers a writer's new object
        # before its metadata commit.
        acquire_storage_identity_lock(
            session,
            backend=backend,
            namespace=namespace,
            object_key=object_key,
        )
    operation_id = session.scalar(
        pg_insert(StorageOperation)
        .values(
            operation="delete",
            backend=backend,
            namespace=namespace,
            object_key=object_key,
            purpose=purpose,
            status="pending",
            next_attempt_at=_now(),
        )
        .on_conflict_do_nothing(constraint="storage_operations_active_identity_key")
        .returning(StorageOperation.id)
    )
    if operation_id is None:
        operation_id = session.scalar(
            select(StorageOperation.id).where(
                StorageOperation.operation == "delete",
                StorageOperation.backend == backend,
                StorageOperation.namespace == namespace,
                StorageOperation.object_key == object_key,
            )
        )
    if operation_id is None:  # defensive: conflict row cannot disappear inside this statement snapshot
        raise RuntimeError("Unable to persist storage operation")
    logger.info(
        "storage_operation_queued operation_id=%s namespace=%s purpose=%s",
        operation_id,
        namespace,
        purpose,
    )
    return operation_id


def prepare_storage_write_cleanup(
    business_session: Session,
    *,
    namespace: str,
    object_key: str,
    backend: str | None = None,
    purpose: str = "write_cleanup",
    session_factory: SessionFactory | None = None,
    hold_identity_lock: bool = True,
) -> UUID:
    """Durably prepare cleanup before a blob write.

    Normal writers hold the identity lock before the intent becomes visible.
    Versioned optimizer outputs use a fresh identity and may defer that lock
    until activation so expensive encoding never holds a database lock.
    """

    backend_name = backend or active_storage_backend(namespace)
    if backend_name not in {"local", "s3"}:
        raise ValueError("Storage backend must be local or s3")
    if hold_identity_lock:
        acquire_storage_identity_lock(
            business_session,
            backend=backend_name,
            namespace=namespace,
            object_key=object_key,
        )

    if session_factory is None:
        bind = business_session.get_bind()
        engine = getattr(bind, "engine", bind)
        session_factory = lambda: Session(bind=engine, expire_on_commit=False)
    with session_factory() as session:
        operation_id = enqueue_delete_intent(
            session,
            backend=backend_name,
            namespace=namespace,
            object_key=object_key,
            purpose=purpose,
            acquire_lock=False,
        )
        # A prior terminal row for this immutable identity must not leave a new
        # write unprotected. Re-arm it and grant the writer the orphan grace
        # window before the caller can attempt the blob write.
        session.execute(
            update(StorageOperation)
            .where(StorageOperation.id == operation_id)
            .values(
                purpose=purpose,
                status="pending",
                attempt_count=0,
                next_attempt_at=_now() + timedelta(seconds=storage_reconciliation_settings.orphan_grace_seconds),
                last_error_code=None,
                last_error_message=None,
                updated_at=_now(),
            )
        )
        session.commit()
    # Integration tests wrap business commits in an outer transaction while
    # this intent intentionally commits independently. Tracking the ID lets the
    # test fixture remove only its own durable artifact after rolling back that
    # outer transaction; production sessions simply discard this in-memory set.
    business_session.info.setdefault("prepared_storage_operation_ids", set()).add(operation_id)
    return operation_id


def confirm_storage_write(session: Session, operation_id: UUID) -> None:
    """Confirm a write in the business transaction that adds its DB reference."""

    session.execute(delete(StorageOperation).where(StorageOperation.id == operation_id))


def expedite_storage_write_cleanup(
    business_session: Session,
    operation_id: UUID,
    *,
    session_factory: SessionFactory | None = None,
) -> None:
    """Make an unconfirmed write eligible for cleanup without its grace delay."""

    if session_factory is None:
        bind = business_session.get_bind()
        engine = getattr(bind, "engine", bind)
        session_factory = lambda: Session(bind=engine, expire_on_commit=False)
    with session_factory() as session:
        session.execute(
            update(StorageOperation)
            .where(StorageOperation.id == operation_id)
            .values(status="pending", next_attempt_at=_now(), updated_at=_now())
        )
        session.commit()


def storage_backoff_seconds(attempt_count: int) -> int:
    settings = storage_reconciliation_settings
    exponent = max(0, attempt_count - 1)
    return min(settings.cap_backoff_seconds, settings.base_backoff_seconds * (2**exponent))


def _record_failure(operation: StorageOperation, code: str, message: str, now: datetime) -> None:
    operation.attempt_count += 1
    operation.status = (
        "failed"
        if operation.attempt_count >= storage_reconciliation_settings.max_attempts
        else "pending"
    )
    operation.last_error_code = code[:64]
    operation.last_error_message = message[:255]
    operation.next_attempt_at = now + timedelta(seconds=storage_backoff_seconds(operation.attempt_count))
    operation.updated_at = now
    if operation.status == "failed":
        logger.error("storage_delete_terminal operation_id=%s code=%s", operation.id, code)
    else:
        logger.warning("storage_delete_retry operation_id=%s code=%s", operation.id, code)


def _storage_error_code(error: Exception) -> str:
    cause = error.__cause__
    if isinstance(cause, PermissionError):
        return "STORAGE_PERMISSION_DENIED"
    if isinstance(cause, ClientError):
        status = cause.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        code = str(cause.response.get("Error", {}).get("Code", ""))
        if status in {401, 403} or code in {
            "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch",
        }:
            return "STORAGE_AUTHORIZATION_FAILED"
        if status is not None and int(status) >= 500:
            return "STORAGE_UNAVAILABLE"
    if isinstance(cause, (BotoCoreError, TimeoutError, ConnectionError)):
        return "STORAGE_UNAVAILABLE"
    return "STORAGE_DELETE_FAILED"


def _delete_operation_object(operation: StorageOperation) -> None:
    _backend(operation.namespace).delete(operation.object_key)
    if operation.namespace == "media" and operation.backend == "s3":
        # S3 is authoritative, but materialized originals and derivatives live
        # in the disposable cache too. Remote success followed by cache failure
        # remains retryable; S3 delete itself is idempotent.
        from app.photos.storage import get_photo_storage_root

        LocalObjectStorage(get_photo_storage_root()).delete(operation.object_key)


def _canonical_original(key: str) -> tuple[UUID, UUID] | None:
    path = PurePosixPath(key)
    if path.as_posix() != key or len(path.parts) != 2 or path.suffix not in ALLOWED_MEDIA_EXTENSIONS:
        return None
    try:
        scope_id = UUID(path.parts[0])
        media_id = UUID(path.stem.split(".", 1)[0])
    except ValueError:
        return None
    stem_parts = path.stem.split(".")
    valid_name = (
        path.parts[1] == f"{media_id}{path.suffix}"
        or (
            len(stem_parts) == 2
            and stem_parts[0] == str(media_id)
            and _VERSION_TOKEN.fullmatch(stem_parts[1]) is not None
            and path.parts[1] == f"{media_id}.{stem_parts[1]}{path.suffix}"
        )
    )
    if str(scope_id) != path.parts[0] or not valid_name:
        return None
    return scope_id, media_id


def _thumbnail_id(key: str) -> UUID | None:
    path = PurePosixPath(key)
    if path.as_posix() != key or len(path.parts) != 2 or path.parts[0] != ".thumbnails" or path.suffix != ".webp":
        return None
    try:
        photo_id = UUID(path.stem)
    except ValueError:
        return None
    return photo_id if path.parts[1] == f"{photo_id}.webp" else None


def _is_referenced(session: Session, operation: StorageOperation) -> bool:
    if operation.namespace == "avatar":
        return session.scalar(
            select(User.id).where(User.avatar_filename == operation.object_key).limit(1)
        ) is not None
    thumbnail_id = _thumbnail_id(operation.object_key)
    if thumbnail_id is not None:
        if operation.purpose == "thumbnail_refresh":
            return False
        return session.scalar(select(Photo.id).where(Photo.id == thumbnail_id).limit(1)) is not None
    return session.scalar(
        select(Photo.id)
        .where(Photo.path == operation.object_key)
        .limit(1)
    ) is not None or session.scalar(
        select(TripNightPhoto.id)
        .where(TripNightPhoto.file_path == operation.object_key)
        .limit(1)
    ) is not None


def process_storage_operation(
    session: Session,
    operation_id: UUID | None = None,
    *,
    force_terminal: bool = False,
) -> bool:
    """Claim and process one operation while holding a row lock.

    Returns whether an eligible row was claimed. The caller owns commit/rollback.
    """

    now = _now()
    candidate_statement = select(StorageOperation)
    if operation_id is None:
        candidate_statement = candidate_statement.where(
            StorageOperation.status == "pending",
            StorageOperation.next_attempt_at <= now,
            StorageOperation.attempt_count < storage_reconciliation_settings.max_attempts,
        ).order_by(StorageOperation.next_attempt_at, StorageOperation.created_at, StorageOperation.id)
    else:
        candidate_statement = candidate_statement.where(StorageOperation.id == operation_id)
        if not force_terminal:
            candidate_statement = candidate_statement.where(
                StorageOperation.status == "pending",
                StorageOperation.next_attempt_at <= now,
                StorageOperation.attempt_count < storage_reconciliation_settings.max_attempts,
            )
    candidate = session.scalar(candidate_statement.limit(1))
    if candidate is None:
        return False

    # Writers hold this lock before touching the blob and before confirming the
    # intent row. Taking the same lock before the row claim avoids both the
    # write/delete race and an advisory-lock/row-lock inversion deadlock.
    try:
        acquire_storage_identity_lock(
            session,
            backend=candidate.backend,
            namespace=candidate.namespace,
            object_key=candidate.object_key,
        )
    except ValueError:
        operation = session.scalar(
            select(StorageOperation)
            .where(StorageOperation.id == candidate.id)
            .with_for_update(skip_locked=True)
        )
        if operation is None:
            return False
        _record_failure(
            operation,
            "STORAGE_IDENTITY_INVALID",
            "Stored object identity is not recognized",
            now,
        )
        return True

    locked_statement = (
        select(StorageOperation)
        .where(StorageOperation.id == candidate.id)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if not force_terminal:
        locked_statement = locked_statement.where(
            StorageOperation.status == "pending",
            StorageOperation.next_attempt_at <= now,
            StorageOperation.attempt_count < storage_reconciliation_settings.max_attempts,
        )
    operation = session.scalar(locked_statement)
    if operation is None:
        return False

    if force_terminal and operation.status == "failed":
        operation.status = "pending"
        operation.attempt_count = 0
        operation.last_error_code = None
        operation.last_error_message = None

    if _is_referenced(session, operation):
        # A reference created after an orphan scan wins the race. The obsolete
        # delete intent is consumed without touching storage.
        session.delete(operation)
        return True
    if operation.backend != active_storage_backend(operation.namespace):
        _record_failure(
            operation,
            "STORAGE_BACKEND_MISMATCH",
            "Recorded storage backend does not match the active configuration",
            now,
        )
        return True
    try:
        _delete_operation_object(operation)
    except Exception as error:
        _record_failure(
            operation,
            _storage_error_code(error),
            "Storage backend could not delete the object",
            now,
        )
        return True
    logger.info(
        "storage_cleanup_succeeded operation_id=%s namespace=%s purpose=%s",
        operation.id,
        operation.namespace,
        operation.purpose,
    )
    session.delete(operation)  # not-found is an idempotent success
    return True


def process_pending_storage_operations(
    batch_size: int | None = None,
    *,
    session_factory: SessionFactory = SessionLocal,
) -> int:
    processed = 0
    for _ in range(batch_size or storage_reconciliation_settings.batch_size):
        with session_factory() as session:
            if not process_storage_operation(session):
                session.rollback()
                break
            session.commit()
            processed += 1
    return processed


def process_storage_operations_best_effort(
    operation_ids: list[UUID] | tuple[UUID, ...],
    *,
    session: Session | None = None,
    session_factory: SessionFactory = SessionLocal,
) -> None:
    """Try explicit post-commit cleanups without affecting logical success."""

    for operation_id in dict.fromkeys(operation_ids):
        try:
            if session is not None:
                if process_storage_operation(session, operation_id):
                    session.commit()
                else:
                    session.rollback()
            else:
                with session_factory() as cleanup_session:
                    if process_storage_operation(cleanup_session, operation_id):
                        cleanup_session.commit()
                    else:
                        cleanup_session.rollback()
        except Exception:
            if session is not None:
                session.rollback()
            logger.warning("storage_delete_post_commit_failed operation_id=%s", operation_id)


def abandon_storage_write(business_session: Session, operation_id: UUID) -> None:
    """Roll back a failed request and synchronously consume its cleanup intent."""

    business_session.rollback()
    try:
        expedite_storage_write_cleanup(business_session, operation_id)
        process_storage_operations_best_effort([operation_id], session=business_session)
    except Exception:
        business_session.rollback()
        logger.warning("storage_write_abandon_cleanup_failed operation_id=%s", operation_id)


def _reconcile_reference_batch(session: Session, model: type[Photo] | type[TripNightPhoto], limit: int) -> int:
    key_column = Photo.path if model is Photo else TripNightPhoto.file_path
    rows = session.scalars(
        select(model)
        .where(key_column.is_not(None))
        .order_by(model.storage_checked_at.asc().nullsfirst(), model.id)
        .with_for_update(skip_locked=True)
        .limit(limit)
    ).all()
    if not rows:
        return 0
    try:
        backend = _backend("media")
    except ObjectStorageError:
        logger.warning("storage_reference_check_unavailable")
        return 0
    checked = 0
    for row in rows:
        key = row.path if isinstance(row, Photo) else row.file_path
        if not key:
            continue
        try:
            details = backend.stat(key)
        except ObjectStorageError:
            # Availability/permission/provider failures must not become a false
            # missing signal. Record the attempt so one bad key cannot starve
            # every later reference from the least-recently-checked batch.
            row.storage_checked_at = _now()
            logger.warning("storage_reference_stat_failed model=%s id=%s", model.__name__, row.id)
            continue
        row.storage_state = "available" if details is not None else "missing"
        row.storage_checked_at = _now()
        if details is None:
            logger.warning(
                "missing_referenced_object model=%s id=%s",
                model.__name__,
                row.id,
            )
        checked += 1
    return checked


def run_fast_reconciliation_cycle(
    *,
    session_factory: SessionFactory = SessionLocal,
    batch_size: int | None = None,
) -> dict[str, int]:
    """Run a bounded cycle safe to execute independently on every API process."""

    limit = batch_size or storage_reconciliation_settings.batch_size
    operations = process_pending_storage_operations(limit, session_factory=session_factory)
    with session_factory() as session:
        photos = _reconcile_reference_batch(session, Photo, limit)
        trip_photos = _reconcile_reference_batch(session, TripNightPhoto, limit)
        session.commit()
    return {"operations": operations, "photos": photos, "trip_night_photos": trip_photos}


def _object_report(item: StorageObject) -> dict[str, object]:
    return {
        "object_key": item.key,
        "size": item.size,
        "last_modified": item.last_modified.isoformat(),
    }


def deep_reconcile_storage(
    session: Session,
    *,
    repair: bool = False,
    grace_seconds: int | None = None,
) -> dict[str, object]:
    """Scan authoritative storage. Dry-run is the default and performs no writes."""

    grace = storage_reconciliation_settings.orphan_grace_seconds if grace_seconds is None else grace_seconds
    if grace < 0:
        raise ValueError("Storage orphan grace must be non-negative")
    now = _now()
    cutoff = now - timedelta(seconds=grace)
    report: dict[str, object] = {
        "mode": "repair" if repair else "dry-run",
        "missing_references": [],
        "orphan_media": [],
        "orphan_thumbnails": [],
        "stale_temp": [],
        "orphan_avatars": [],
        "stale_avatar_temp": [],
        "unsupported_unsafe": [],
        "size_mismatches": [],
        "backend_errors": [],
        "pending_deletes": [],
        "failed_deletes": [],
        "quota_drift": {"recorded_bytes": 0, "existing_bytes": 0, "difference_bytes": 0},
        "enqueued": 0,
        "attempted": 0,
        "processed": 0,
    }
    media_backend = _backend("media")
    avatar_backend = _backend("avatar")
    media_references: set[str] = set()
    avatar_references: set[str] = set()
    photo_ids: set[UUID] = set()
    recorded_bytes = existing_bytes = 0

    references: list[tuple[str, type[Photo] | type[TripNightPhoto], UUID, str, int | None]] = []
    for photo in session.scalars(select(Photo)).all():
        photo_ids.add(photo.id)
        if photo.path:
            media_references.add(photo.path)
            references.append(("photo", Photo, photo.id, photo.path, photo.file_size_bytes))
    for photo in session.scalars(select(TripNightPhoto)).all():
        media_references.add(photo.file_path)
        references.append(("trip_night_photo", TripNightPhoto, photo.id, photo.file_path, photo.file_size_bytes))

    for kind, model, row_id, snapshot_key, snapshot_size in references:
        if repair and _canonical_original(snapshot_key) is not None:
            # Writers acquire the identity lock before their metadata row can
            # be locked during flush. Keep the same order to avoid a cycle.
            acquire_storage_identity_lock(
                session,
                backend=active_storage_backend("media"),
                namespace="media",
                object_key=snapshot_key,
            )
        row = (
            session.scalar(
                select(model)
                .where(model.id == row_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if repair
            else session.get(model, row_id)
        )
        if row is None:
            continue
        key = row.path if isinstance(row, Photo) else row.file_path
        recorded_size = row.file_size_bytes
        if key != snapshot_key:
            # A concurrent writer changed the identity after the scan snapshot.
            # Never apply observations made for the previous path.
            continue
        recorded_bytes += recorded_size or 0
        if _canonical_original(key) is None:
            report["unsupported_unsafe"].append({"source": kind, "id": str(row_id), "object_key": key})
            if repair:
                session.commit()
            continue
        try:
            # The row lock is held while this fresh stat and any correction are
            # applied, serializing repair with metadata writers.
            details = media_backend.stat(key)
        except ObjectStorageError:
            report["backend_errors"].append({"source": kind, "id": str(row_id), "code": "STORAGE_STAT_FAILED"})
            if repair:
                session.commit()
            continue
        if details is None:
            report["missing_references"].append({"source": kind, "id": str(row_id), "object_key": key})
            if repair:
                row.storage_state = "missing"
                row.storage_checked_at = now
                session.commit()
            continue
        existing_bytes += details.size
        if recorded_size != details.size:
            report["size_mismatches"].append(
                {"source": kind, "id": str(row_id), "object_key": key, "recorded": recorded_size, "actual": details.size}
            )
            if repair:
                row.file_size_bytes = details.size
        if repair:
            row.storage_state = "available"
            row.storage_checked_at = now
            # Release the row and identity locks after each object. Deep repair
            # must not retain locks for the duration of a full bucket scan.
            session.commit()

    for user in session.scalars(select(User).where(User.avatar_filename.is_not(None))).all():
        key = user.avatar_filename
        if key is None:
            continue
        avatar_references.add(key)
        if _canonical_avatar(key) is None:
            report["unsupported_unsafe"].append({"source": "avatar", "id": str(user.id), "object_key": key})
            continue
        try:
            details = avatar_backend.stat(key)
        except ObjectStorageError:
            report["unsupported_unsafe"].append({"source": "avatar", "id": str(user.id), "object_key": key})
            continue
        if details is None:
            report["missing_references"].append({"source": "avatar", "id": str(user.id), "object_key": key})

    eligible: list[tuple[StorageObject, str]] = []
    try:
        storage_objects = media_backend.list_objects()
    except ObjectStorageError:
        report["backend_errors"].append({"source": "media_scan", "code": "STORAGE_LIST_FAILED"})
        storage_objects = []
    for item in storage_objects:
        if item.unsafe:
            report["unsupported_unsafe"].append(_object_report(item))
        elif item.key in media_references:
            continue
        elif _canonical_original(item.key) is not None:
            report["orphan_media"].append(_object_report(item))
            logger.warning("orphan_detected namespace=media object_key=%s", item.key)
            if item.last_modified <= cutoff:
                eligible.append((item, "orphan_media"))
        elif (thumbnail_id := _thumbnail_id(item.key)) is not None:
            if thumbnail_id not in photo_ids:
                report["orphan_thumbnails"].append(_object_report(item))
                if item.last_modified <= cutoff:
                    eligible.append((item, "orphan_thumbnail"))
        elif _media_temp_kind(item.key) is not None:
            report["stale_temp"].append(_object_report(item))
            if item.last_modified <= cutoff:
                eligible.append((item, "stale_temp"))
        else:
            report["unsupported_unsafe"].append(_object_report(item))

    avatar_eligible: list[tuple[StorageObject, str]] = []
    try:
        avatar_objects = avatar_backend.list_objects()
    except ObjectStorageError:
        report["backend_errors"].append({"source": "avatar_scan", "code": "STORAGE_LIST_FAILED"})
        avatar_objects = []
    for item in avatar_objects:
        if item.unsafe:
            report["unsupported_unsafe"].append({**_object_report(item), "namespace": "avatar"})
        elif item.key in avatar_references:
            continue
        elif _canonical_avatar(item.key) is not None:
            report["orphan_avatars"].append(_object_report(item))
            logger.warning("orphan_detected namespace=avatar object_key=%s", item.key)
            if item.last_modified <= cutoff:
                avatar_eligible.append((item, "orphan_avatar"))
        elif _avatar_temp_kind(item.key) is not None:
            report["stale_avatar_temp"].append(_object_report(item))
            if item.last_modified <= cutoff:
                avatar_eligible.append((item, "stale_avatar_temp"))
        else:
            report["unsupported_unsafe"].append({**_object_report(item), "namespace": "avatar"})

    existing_operation_ids = list(session.scalars(select(StorageOperation.id)).all())

    report["quota_drift"] = {
        "recorded_bytes": recorded_bytes,
        "existing_bytes": existing_bytes,
        "difference_bytes": existing_bytes - recorded_bytes,
    }
    if repair:
        operation_ids = [
            enqueue_delete_intent(
                session,
                backend=active_storage_backend("media"),
                namespace="media",
                object_key=item.key,
                purpose=purpose,
            )
            for item, purpose in eligible
        ]
        operation_ids.extend(
            enqueue_delete_intent(
                session,
                backend="local",
                namespace="avatar",
                object_key=item.key,
                purpose=purpose,
            )
            for item, purpose in avatar_eligible
        )
        report["enqueued"] = len(operation_ids)
        operation_ids = list(dict.fromkeys([*existing_operation_ids, *operation_ids]))
        # Persist state corrections and intents first. Each deletion then gets
        # its own transaction and performs a fresh reference guard.
        session.commit()
        processed = attempted = 0
        for operation_id in operation_ids:
            if process_storage_operation(session, operation_id, force_terminal=True):
                session.commit()
                attempted += 1
                if session.get(StorageOperation, operation_id) is None:
                    processed += 1
                else:
                    operation = session.get(StorageOperation, operation_id)
                    report["backend_errors"].append(
                        {
                            "source": "storage_delete",
                            "id": str(operation_id),
                            "code": operation.last_error_code or "STORAGE_DELETE_PENDING",
                        }
                    )
            else:
                session.rollback()
                report["backend_errors"].append(
                    {
                        "source": "storage_delete",
                        "id": str(operation_id),
                        "code": "STORAGE_OPERATION_NOT_CLAIMED",
                    }
                )
        report["attempted"] = attempted
        report["processed"] = processed

    session.expire_all()
    operations = session.scalars(select(StorageOperation).order_by(StorageOperation.created_at)).all()
    for operation in operations:
        target = "failed_deletes" if operation.status == "failed" else "pending_deletes"
        report[target].append(
            {
                "id": str(operation.id),
                "backend": operation.backend,
                "namespace": operation.namespace,
                "object_key": operation.object_key,
                "attempt_count": operation.attempt_count,
                "error_code": operation.last_error_code,
            }
        )
    return report
