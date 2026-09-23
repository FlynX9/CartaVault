from __future__ import annotations

from datetime import UTC, datetime, timedelta
from dataclasses import replace
from pathlib import Path
import threading
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media.service import infer_file_state
from app.photos.models import Photo, StorageOperation
from app.photos.object_storage import LocalObjectStorage, ObjectStorageError
from app.photos import reconciliation
from app.config import storage_reconciliation_settings


def canonical_key() -> tuple[str, object, object]:
    scope_id = uuid4()
    photo_id = uuid4()
    return f"{scope_id}/{photo_id}.jpg", scope_id, photo_id


@pytest.mark.unit
def test_backoff_is_bounded_exponential(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        reconciliation,
        "storage_reconciliation_settings",
        SimpleNamespace(base_backoff_seconds=10, cap_backoff_seconds=35),
    )
    assert [reconciliation.storage_backoff_seconds(value) for value in (1, 2, 3, 8)] == [10, 20, 35, 35]


@pytest.mark.unit
def test_reconciliation_batch_configuration_is_bounded() -> None:
    with pytest.raises(RuntimeError, match="at most 1000"):
        replace(storage_reconciliation_settings, batch_size=1_001)


@pytest.mark.unit
def test_reconciled_missing_photo_is_not_healthy() -> None:
    key, scope_id, photo_id = canonical_key()
    photo = Photo(
        id=photo_id,
        filename=f"{photo_id}.jpg",
        path=key,
        storage_scope_id=scope_id,
        width=10,
        height=10,
        storage_state="missing",
    )
    assert infer_file_state(photo) == "missing"
    photo.storage_state = "available"
    assert infer_file_state(photo) == "healthy"


@pytest.mark.unit
def test_local_scan_never_follows_symlinks_and_delete_rejects_them(tmp_path: Path) -> None:
    root = tmp_path / "media"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.jpg").write_bytes(b"outside")
    link = root / str(uuid4())
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Symbolic links are unavailable for this test account")

    backend = LocalObjectStorage(root)
    objects = backend.list_objects()
    assert [(item.key, item.unsafe) for item in objects] == [(link.name, True)]
    with pytest.raises(ObjectStorageError, match="symbolic links"):
        backend.delete(f"{link.name}/secret.jpg")
    assert (outside / "secret.jpg").exists()


@pytest.mark.unit
def test_local_object_operations_reject_traversal(tmp_path: Path) -> None:
    root = tmp_path / "media"
    root.mkdir()
    backend = LocalObjectStorage(root)
    with pytest.raises(ObjectStorageError, match="Invalid local"):
        backend.stat("../outside.jpg")
    with pytest.raises(ObjectStorageError, match="Invalid local"):
        backend.delete(r"..\outside.jpg")
    with pytest.raises(ObjectStorageError, match="Invalid local"):
        backend.delete("scope//outside.jpg")


@pytest.mark.unit
def test_secure_local_delete_rejects_directory_swapped_to_symlink(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "media"
    scope = root / "scope"
    outside = tmp_path / "outside"
    scope.mkdir(parents=True)
    outside.mkdir()
    (scope / "secret.jpg").write_bytes(b"inside")
    external = outside / "secret.jpg"
    external.write_bytes(b"outside")
    backend = LocalObjectStorage(root)
    if not backend._supports_secure_delete():
        pytest.skip("Directory-relative no-follow deletion is unavailable")
    original_support = backend._supports_secure_delete

    def swap_before_delete() -> bool:
        parked = root / "parked"
        scope.rename(parked)
        try:
            scope.symlink_to(outside, target_is_directory=True)
        except OSError:
            parked.rename(scope)
            pytest.skip("Symbolic links are unavailable for this test account")
        return original_support()

    monkeypatch.setattr(backend, "_supports_secure_delete", swap_before_delete)
    with pytest.raises(ObjectStorageError):
        backend.delete("scope/secret.jpg")
    assert external.read_bytes() == b"outside"


@pytest.mark.unit
@pytest.mark.parametrize(
    ("namespace", "object_key"),
    [
        ("media", "safe-looking/unrelated.webp"),
        ("media", f"{uuid4()}/notes.txt"),
        ("media", f"{uuid4()}/random.partial"),
        ("avatar", "profile.webp"),
        ("avatar", f"{uuid4()}.png"),
    ],
)
def test_delete_intents_reject_unrecognized_identities(namespace: str, object_key: str) -> None:
    with pytest.raises(ValueError, match="recognized CartaVault identity"):
        reconciliation.validate_storage_identity(namespace, object_key)


@pytest.mark.unit
def test_delete_intent_rejects_noncanonical_key_alias() -> None:
    scope_id = uuid4()
    photo_id = uuid4()
    with pytest.raises(ValueError, match="invalid"):
        reconciliation.validate_storage_identity("media", f"{scope_id}//{photo_id}.jpg")


@pytest.mark.integration
def test_intent_dedup_and_reference_guard(database_session, monkeypatch: pytest.MonkeyPatch) -> None:
    key, scope_id, photo_id = canonical_key()
    first = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=key,
        purpose="orphan_media",
    )
    second = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=key,
        purpose="orphan_media",
    )
    assert first == second
    database_session.add(
        Photo(
            id=photo_id,
            filename=f"{photo_id}.jpg",
            path=key,
            storage_scope_id=scope_id,
            width=10,
            height=10,
            storage_state="available",
        )
    )
    database_session.flush()
    backend = Mock()
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: backend)
    monkeypatch.setattr(reconciliation, "active_storage_backend", lambda _namespace: "local")

    assert reconciliation.process_storage_operation(database_session, first, force_terminal=True)
    database_session.flush()
    assert database_session.get(StorageOperation, first) is None
    backend.delete.assert_not_called()


@pytest.mark.integration
def test_write_cleanup_is_prepared_independently_and_confirmed_in_business_session(database_session) -> None:
    key, _, _ = canonical_key()

    def independent_session() -> Session:
        return Session(
            bind=database_session.get_bind(),
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )

    operation_id = reconciliation.prepare_storage_write_cleanup(
        database_session,
        namespace="media",
        backend="local",
        object_key=key,
        session_factory=independent_session,
    )
    assert database_session.get(StorageOperation, operation_id) is not None
    operation = database_session.get(StorageOperation, operation_id)
    assert operation.next_attempt_at > datetime.now(UTC).replace(tzinfo=None)

    reconciliation.confirm_storage_write(database_session, operation_id)
    database_session.flush()
    assert database_session.get(StorageOperation, operation_id) is None


@pytest.mark.integration
def test_transient_failure_remains_pending(database_session, monkeypatch: pytest.MonkeyPatch) -> None:
    key, _, _ = canonical_key()
    operation_id = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=key,
        purpose="photo_delete",
    )
    failing_backend = Mock()
    failing_backend.delete.side_effect = ObjectStorageError("offline")
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: failing_backend)
    monkeypatch.setattr(reconciliation, "active_storage_backend", lambda _namespace: "local")

    assert reconciliation.process_storage_operation(database_session, operation_id)
    database_session.flush()
    operation = database_session.get(StorageOperation, operation_id)
    assert operation.status == "pending"
    assert operation.attempt_count == 1


@pytest.mark.integration
def test_write_intent_survives_business_rollback(test_engine) -> None:
    key, _, _ = canonical_key()
    with Session(test_engine, expire_on_commit=False) as business_session:
        operation_id = reconciliation.prepare_storage_write_cleanup(
            business_session,
            namespace="media",
            backend="local",
            object_key=key,
        )
        business_session.rollback()
    with Session(test_engine) as verification:
        assert verification.get(StorageOperation, operation_id) is not None
        verification.execute(StorageOperation.__table__.delete().where(StorageOperation.id == operation_id))
        verification.commit()


@pytest.mark.integration
def test_writer_transaction_guard_prevents_concurrent_cleaner_delete(test_engine, monkeypatch) -> None:
    key, scope_id, photo_id = canonical_key()
    backend = Mock()
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: backend)
    monkeypatch.setattr(reconciliation, "active_storage_backend", lambda _namespace: "local")
    writer = Session(test_engine, expire_on_commit=False)
    operation_id = reconciliation.prepare_storage_write_cleanup(
        writer,
        namespace="media",
        backend="local",
        object_key=key,
    )
    writer.add(
        Photo(
            id=photo_id,
            filename=f"{photo_id}.jpg",
            path=key,
            storage_scope_id=scope_id,
            width=10,
            height=10,
            storage_state="available",
        )
    )
    reconciliation.confirm_storage_write(writer, operation_id)
    writer.flush()

    finished = threading.Event()

    def cleaner() -> None:
        with Session(test_engine) as cleanup_session:
            reconciliation.process_storage_operation(cleanup_session, operation_id, force_terminal=True)
            cleanup_session.commit()
        finished.set()

    thread = threading.Thread(target=cleaner, daemon=True)
    thread.start()
    assert not finished.wait(0.15)
    backend.delete.assert_not_called()
    writer.commit()
    assert finished.wait(5)
    backend.delete.assert_not_called()
    writer.close()
    with Session(test_engine) as cleanup:
        cleanup.execute(Photo.__table__.delete().where(Photo.id == photo_id))
        cleanup.commit()


@pytest.mark.integration
def test_deep_repair_cannot_consume_writer_intent_before_identity_lock(
    test_engine,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A repair racing the preparation boundary must not see a writer intent."""

    monkeypatch.setenv("MEDIA_STORAGE", "local")
    key, _, _ = canonical_key()
    writer = Session(test_engine, expire_on_commit=False)
    writer_at_lock = threading.Event()
    release_writer = threading.Event()
    repair_finished = threading.Event()
    writer_result: dict[str, object] = {}
    repair_result: dict[str, object] = {}
    real_acquire = reconciliation.acquire_storage_identity_lock

    def gated_acquire(session: Session, **kwargs: object) -> None:
        if session is writer:
            writer_at_lock.set()
            release_writer.wait(5)
        real_acquire(session, **kwargs)

    monkeypatch.setattr(reconciliation, "acquire_storage_identity_lock", gated_acquire)

    def prepare_writer() -> None:
        try:
            writer_result["operation_id"] = reconciliation.prepare_storage_write_cleanup(
                writer,
                backend="local",
                namespace="media",
                object_key=key,
            )
        except BaseException as error:  # propagate assertion context to the test thread
            writer_result["error"] = error

    def run_repair() -> None:
        try:
            with Session(test_engine) as repair_session:
                repair_result["report"] = reconciliation.deep_reconcile_storage(
                    repair_session,
                    repair=True,
                    grace_seconds=0,
                )
                repair_session.commit()
        except BaseException as error:  # propagate assertion context to the test thread
            repair_result["error"] = error
        finally:
            repair_finished.set()

    writer_thread = threading.Thread(target=prepare_writer, daemon=True)
    repair_thread: threading.Thread | None = None
    try:
        writer_thread.start()
        assert writer_at_lock.wait(5)

        # With the old ordering this query observes the already committed
        # intent while the writer is still waiting at the canonical lock.
        with Session(test_engine) as observer:
            assert observer.scalar(
                select(StorageOperation.id).where(
                    StorageOperation.backend == "local",
                    StorageOperation.namespace == "media",
                    StorageOperation.object_key == key,
                )
            ) is None

        repair_thread = threading.Thread(target=run_repair, daemon=True)
        repair_thread.start()
        assert repair_finished.wait(5)
    finally:
        release_writer.set()
        writer_thread.join(5)
        if repair_thread is not None:
            repair_thread.join(5)
        writer.close()

    assert not writer_thread.is_alive()
    assert "error" not in writer_result, writer_result.get("error")
    assert "error" not in repair_result, repair_result.get("error")
    report = repair_result["report"]
    assert isinstance(report, dict)
    assert report["attempted"] == 0
    assert report["processed"] == 0

    operation_id = writer_result["operation_id"]
    with Session(test_engine) as cleanup:
        cleanup.execute(
            StorageOperation.__table__.delete().where(StorageOperation.id == operation_id)
        )
        cleanup.commit()


@pytest.mark.integration
def test_writer_intent_is_reclaimed_after_writer_crash(
    test_engine,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A durable intent still cleans a blob when the writer dies before metadata."""

    monkeypatch.setenv("MEDIA_STORAGE", "local")
    key, _, _ = canonical_key()
    physical = photo_storage / key
    physical.parent.mkdir(parents=True)
    physical.write_bytes(b"crashed-writer")

    writer = Session(test_engine, expire_on_commit=False)
    operation_id = reconciliation.prepare_storage_write_cleanup(
        writer,
        backend="local",
        namespace="media",
        object_key=key,
    )
    # Closing an uncommitted business session models a process crash after the
    # intent and blob write but before the metadata transaction commits.
    writer.close()

    with Session(test_engine) as cleanup:
        assert reconciliation.process_storage_operation(
            cleanup,
            operation_id,
            force_terminal=True,
        )
        cleanup.commit()

    assert not physical.exists()
    with Session(test_engine) as verification:
        assert verification.get(StorageOperation, operation_id) is None


@pytest.mark.integration
def test_committed_writer_reference_wins_over_concurrent_cleanup(
    test_engine,
    photo_storage: Path,
) -> None:
    """A cleaner blocked by the writer lock consumes no referenced intent."""

    key, scope_id, photo_id = canonical_key()
    physical = photo_storage / key
    physical.parent.mkdir(parents=True)
    physical.write_bytes(b"committed-writer")

    writer = Session(test_engine, expire_on_commit=False)
    operation_id = reconciliation.prepare_storage_write_cleanup(
        writer,
        backend="local",
        namespace="media",
        object_key=key,
    )
    writer.add(
        Photo(
            id=photo_id,
            filename=f"{photo_id}.jpg",
            path=key,
            storage_scope_id=scope_id,
            width=10,
            height=10,
            storage_state="available",
        )
    )
    reconciliation.confirm_storage_write(writer, operation_id)
    writer.flush()

    cleaner_started = threading.Event()
    cleaner_finished = threading.Event()
    cleaner_result: dict[str, object] = {}

    def clean() -> None:
        try:
            with Session(test_engine) as cleanup:
                cleaner_started.set()
                cleaner_result["claimed"] = reconciliation.process_storage_operation(
                    cleanup,
                    operation_id,
                    force_terminal=True,
                )
                cleanup.commit()
        except BaseException as error:  # propagate assertion context to the test thread
            cleaner_result["error"] = error
        finally:
            cleaner_finished.set()

    cleaner = threading.Thread(target=clean, daemon=True)
    cleaner.start()
    assert cleaner_started.wait(5)
    assert not cleaner_finished.is_set()

    writer.commit()
    assert cleaner_finished.wait(5)
    cleaner.join(5)
    writer.close()

    assert "error" not in cleaner_result, cleaner_result.get("error")
    assert cleaner_result["claimed"] is False
    assert physical.exists()
    with Session(test_engine) as cleanup:
        assert cleanup.get(StorageOperation, operation_id) is None
        cleanup.delete(cleanup.get(Photo, photo_id))
        cleanup.commit()
    physical.unlink()
    physical.parent.rmdir()


@pytest.mark.integration
def test_terminal_failure_is_retained_and_sanitized(database_session, monkeypatch: pytest.MonkeyPatch) -> None:
    key, _, _ = canonical_key()
    operation_id = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=key,
        purpose="write_cleanup",
    )
    operation = database_session.get(StorageOperation, operation_id)
    operation.attempt_count = reconciliation.storage_reconciliation_settings.max_attempts - 1
    operation.next_attempt_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    failing_backend = Mock()
    failing_backend.delete.side_effect = ObjectStorageError("provider response with sensitive details")
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: failing_backend)
    monkeypatch.setattr(reconciliation, "active_storage_backend", lambda _namespace: "local")

    assert reconciliation.process_storage_operation(database_session, operation_id)
    database_session.flush()
    retained = database_session.get(StorageOperation, operation_id)
    assert retained is not None
    assert retained.status == "failed"
    assert retained.attempt_count == reconciliation.storage_reconciliation_settings.max_attempts
    assert retained.last_error_code == "STORAGE_DELETE_FAILED"
    assert "sensitive" not in retained.last_error_message
    # Periodic claims do not spin on terminal rows; an operator can still see
    # and explicitly force this retained operation after correcting storage.
    assert not reconciliation.process_storage_operation(database_session, operation_id)


@pytest.mark.integration
def test_backend_error_does_not_mark_reference_missing(database_session, monkeypatch: pytest.MonkeyPatch) -> None:
    key, scope_id, photo_id = canonical_key()
    photo = Photo(
        id=photo_id,
        filename=f"{photo_id}.jpg",
        path=key,
        storage_scope_id=scope_id,
        width=10,
        height=10,
        storage_state="available",
    )
    database_session.add(photo)
    database_session.flush()
    backend = Mock()
    backend.stat.side_effect = ObjectStorageError("offline")
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: backend)

    assert reconciliation._reconcile_reference_batch(database_session, Photo, 10) == 0
    assert photo.storage_state == "available"
    assert photo.storage_checked_at is not None


@pytest.mark.integration
def test_deep_dry_run_reports_aged_orphan_without_mutation(
    database_session,
    photo_storage: Path,
) -> None:
    key, scope_id, photo_id = canonical_key()
    path = photo_storage / key
    path.parent.mkdir(parents=True)
    path.write_bytes(b"orphan")
    old = datetime.now(UTC).timestamp() - 3600
    path.touch()
    import os
    os.utime(path, (old, old))

    report = reconciliation.deep_reconcile_storage(database_session, grace_seconds=60)
    assert [entry["object_key"] for entry in report["orphan_media"]] == [key]
    assert report["enqueued"] == 0
    assert database_session.scalars(select(StorageOperation)).all() == []
    path.unlink()
    path.parent.rmdir()


@pytest.mark.integration
def test_deep_repair_corrects_existing_size_but_keeps_reference(
    database_session,
    photo_storage: Path,
) -> None:
    key, scope_id, photo_id = canonical_key()
    path = photo_storage / key
    path.parent.mkdir(parents=True)
    path.write_bytes(b"immutable-bytes")
    photo = Photo(
        id=photo_id,
        filename=f"{photo_id}.jpg",
        path=key,
        storage_scope_id=scope_id,
        file_size_bytes=999,
        width=10,
        height=10,
        storage_state="unchecked",
    )
    database_session.add(photo)
    database_session.flush()

    report = reconciliation.deep_reconcile_storage(database_session, repair=True)
    assert report["size_mismatches"][0]["actual"] == len(b"immutable-bytes")
    assert photo.file_size_bytes == len(b"immutable-bytes")
    assert photo.storage_state == "available"
    assert path.exists()
    path.unlink()
    path.parent.rmdir()


@pytest.mark.integration
def test_deep_avatar_scan_repairs_only_recognized_aged_objects(
    database_session,
    photo_storage: Path,
    auth_user,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    avatar_storage = tmp_path / "avatars"
    avatar_storage.mkdir()
    monkeypatch.setenv("AVATAR_STORAGE_PATH", str(avatar_storage))
    orphan_id = uuid4()
    temp_id = uuid4()
    orphan = avatar_storage / f"{orphan_id}.webp"
    temporary = avatar_storage / f".{temp_id}.webp.partial"
    unknown = avatar_storage / "do-not-delete.txt"
    orphan.write_bytes(b"orphan")
    temporary.write_bytes(b"partial")
    unknown.write_bytes(b"unknown")
    missing_avatar = f"{uuid4()}.webp"
    auth_user.avatar_filename = missing_avatar
    database_session.flush()

    report = reconciliation.deep_reconcile_storage(database_session, repair=True, grace_seconds=0)

    assert any(entry["object_key"] == missing_avatar for entry in report["missing_references"])
    assert [entry["object_key"] for entry in report["orphan_avatars"]] == [orphan.name]
    assert [entry["object_key"] for entry in report["stale_avatar_temp"]] == [temporary.name]
    assert not orphan.exists()
    assert not temporary.exists()
    assert unknown.read_bytes() == b"unknown"
    unknown.unlink()


@pytest.mark.integration
def test_deep_repair_reports_delete_failure_and_retains_operation(
    database_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key, _, _ = canonical_key()
    operation_id = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=key,
        purpose="orphan_media",
    )
    database_session.commit()
    monkeypatch.setattr(
        reconciliation,
        "_delete_operation_object",
        Mock(side_effect=ObjectStorageError("offline")),
    )

    report = reconciliation.deep_reconcile_storage(database_session, repair=True)

    assert report["attempted"] >= 1
    assert {
        "source": "storage_delete",
        "id": str(operation_id),
        "code": "STORAGE_DELETE_FAILED",
    } in report["backend_errors"]
    assert str(operation_id) in [item["id"] for item in report["pending_deletes"]]
