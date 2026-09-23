from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from threading import Barrier, Event, Thread
from uuid import uuid4

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

import app.media.optimization as optimization
from app.auth.models import User
from app.media.settings import get_max_image_dimension
from app.photos.models import Photo, StorageOperation
from app.tasks.models import BackgroundTask


pytestmark = pytest.mark.integration


def test_revocation_after_prepare_does_not_rewrite_referenced_bytes(
    test_engine,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope_id = uuid4()
    user_id = uuid4()
    photo_id = uuid4()
    with test_engine.begin() as connection:
        connection.execute(
            User.__table__.insert().values(
                id=user_id,
                email=f"media-optimizer-{user_id}@example.test",
                display_name="Media optimizer",
                password_hash="test-only-not-a-real-password-hash",
                is_admin=True,
                is_active=True,
            )
        )
        connection.execute(
            Photo.__table__.insert().values(
                id=photo_id,
                storage_scope_id=scope_id,
                filename="pending.webp",
                original_name="original.webp",
                mime_type="image/webp",
                uploaded_by_user_id=user_id,
                file_size_bytes=0,
                width=1,
                height=1,
                storage_state="available",
            )
        )
    session = Session(test_engine, expire_on_commit=False)
    photo = session.get(Photo, photo_id)
    assert photo is not None
    photo.path = f"{scope_id}/{photo.id}.webp"
    relative_path = photo.path
    maximum = get_max_image_dimension(session)
    source_path = photo_storage / str(scope_id) / f"{photo.id}.webp"
    source_path.parent.mkdir(parents=True)
    try:
        with Image.new("RGB", (maximum + 200, maximum + 100), "#0fa68a") as image:
            image.save(source_path, format="WEBP", quality=100, method=6)
        original_bytes = source_path.read_bytes()
        original_hash = sha256(original_bytes).hexdigest()
        photo.file_size_bytes = len(original_bytes)
        photo.width = maximum + 200
        photo.height = maximum + 100
        session.commit()

        task = BackgroundTask(
            id=uuid4(),
            task_type=optimization.MEDIA_OPTIMIZATION_TASK,
            requested_by_user_id=user_id,
            status="running",
            progress_current=0,
            progress_total=1,
            progress_message="Traitement en cours",
            input_json={},
            attempt_count=1,
            max_attempts=3,
            created_at=datetime.now(UTC).replace(tzinfo=None),
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )

        prepared = Event()
        resume = Event()
        original_check = optimization._require_current_admin

        def pause_before_activation(session, user_id, *, lock=False):
            if lock:
                prepared.set()
                assert resume.wait(timeout=5)
            return original_check(session, user_id, lock=lock)

        monkeypatch.setattr(optimization, "_require_current_admin", pause_before_activation)

        def demote_admin() -> None:
            assert prepared.wait(timeout=5)
            with test_engine.begin() as connection:
                result = connection.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(is_admin=False)
                )
            assert result.rowcount == 1
            resume.set()

        demotion = Thread(target=demote_admin, daemon=True)
        demotion.start()
        with pytest.raises(HTTPException) as error:
            optimization.optimize_existing_media(
                session,
                task,
                lambda _current, _total, _message: None,
            )
        demotion.join(timeout=5)

        assert error.value.status_code == 403
        session.rollback()
        session.refresh(photo)
        assert photo.path == relative_path
        assert photo.file_size_bytes == len(original_bytes)
        assert photo.width == maximum + 200
        assert photo.height == maximum + 100
        assert sha256(source_path.read_bytes()).hexdigest() == original_hash
        assert source_path.stat().st_size == len(original_bytes)
        assert task.status == "running"
    finally:
        resume.set() if "resume" in locals() else None
        if "demotion" in locals():
            demotion.join(timeout=5)
        session.rollback()
        session.close()
        operation_ids = set(session.info.get("prepared_storage_operation_ids", set()))
        with test_engine.begin() as connection:
            connection.execute(Photo.__table__.delete().where(Photo.id == photo_id))
            connection.execute(User.__table__.delete().where(User.id == user_id))
            if operation_ids:
                connection.execute(delete(StorageOperation).where(StorageOperation.id.in_(operation_ids)))
        source_path.unlink(missing_ok=True)


def test_two_optimizers_activate_at_most_one_candidate(
    test_engine,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope_id = uuid4()
    user_id = uuid4()
    photo_id = uuid4()
    with test_engine.begin() as connection:
        connection.execute(
            User.__table__.insert().values(
                id=user_id,
                email=f"media-race-{user_id}@example.test",
                display_name="Media race",
                password_hash="test-only-not-a-real-password-hash",
                is_admin=True,
                is_active=True,
            )
        )
        connection.execute(
            Photo.__table__.insert().values(
                id=photo_id,
                storage_scope_id=scope_id,
                path=f"{scope_id}/{photo_id}.png",
                filename=f"{photo_id}.png",
                original_name="race.png",
                mime_type="image/png",
                uploaded_by_user_id=user_id,
                file_size_bytes=0,
                width=1200,
                height=900,
                storage_state="available",
            )
        )

    source_path = photo_storage / str(scope_id) / f"{photo_id}.png"
    source_path.parent.mkdir(parents=True)
    with Image.new("RGB", (1200, 900), "#0fa68a") as image:
        image.save(source_path, format="PNG")

    sessions = [Session(test_engine, expire_on_commit=False) for _ in range(2)]
    tasks = [
        BackgroundTask(
            id=uuid4(),
            task_type=optimization.MEDIA_OPTIMIZATION_TASK,
            requested_by_user_id=user_id,
            status="running",
            progress_current=0,
            progress_total=1,
            progress_message="Traitement en cours",
            input_json={},
            attempt_count=1,
            max_attempts=3,
            created_at=datetime.now(UTC).replace(tzinfo=None),
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )
        for _ in sessions
    ]
    ready = Barrier(2)
    real_persist = optimization.persist_materialized_photo
    results: list[dict | BaseException | None] = [None, None]

    def persist_then_race(*args, **kwargs) -> None:
        real_persist(*args, **kwargs)
        ready.wait(timeout=10)

    monkeypatch.setattr(optimization, "persist_materialized_photo", persist_then_race)

    def run(index: int) -> None:
        try:
            results[index] = optimization.optimize_existing_media(
                sessions[index],
                tasks[index],
                lambda _current, _total, _message: None,
            )
        except BaseException as error:  # pragma: no cover - reported below
            results[index] = error

    workers = [Thread(target=run, args=(index,), daemon=True) for index in range(2)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=20)

    try:
        assert all(not worker.is_alive() for worker in workers)
        assert all(isinstance(result, dict) for result in results), results
        assert sum(result["optimized"] for result in results if isinstance(result, dict)) == 1
        assert sum(result["skipped"] for result in results if isinstance(result, dict)) == 1

        with Session(test_engine, expire_on_commit=False) as check_session:
            photo = check_session.get(Photo, photo_id)
            assert photo is not None
            assert photo.mime_type == "image/webp"
            assert photo.path is not None and photo.path.endswith(".webp")
            assert check_session.scalars(
                select(StorageOperation).where(StorageOperation.object_key.like(f"{scope_id}/{photo_id}.%"))
            ).all() == []
        assert source_path.exists() is False
        assert len(list(source_path.parent.glob(f"{photo_id}.*.webp"))) == 1
    finally:
        for session in sessions:
            session.rollback()
            session.close()
        with test_engine.begin() as connection:
            connection.execute(Photo.__table__.delete().where(Photo.id == photo_id))
            connection.execute(User.__table__.delete().where(User.id == user_id))
        for candidate in source_path.parent.glob(f"{photo_id}.*.webp"):
            candidate.unlink(missing_ok=True)
        source_path.unlink(missing_ok=True)
