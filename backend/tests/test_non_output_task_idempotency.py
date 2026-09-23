from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.categories.models import Category
from app.imports import service as import_service
from app.maps.models import PoiMap
from app.media import optimization as media_optimization
from app.photos.models import Photo
from app.photos.reconciliation import deep_reconcile_storage
from app.photos.storage import delete_photo_file
from app.places.models import Place
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.statuses.models import PlaceStatus
from app.tasks.handlers import KMZ_IMPORT_TASK, handle_kmz_import
from app.tasks.models import BackgroundTask, KmzImportPreview
from app.tasks.registry import TaskHandlerResult, clear_rollback_cleanups
from app.tasks.service import _finalize_success, claim_task


pytestmark = pytest.mark.integration


def _image_bytes(index: int, *, size: tuple[int, int] = (96, 64)) -> bytes:
    output = BytesIO()
    color = ((index * 47) % 255, (index * 83) % 255, (index * 131) % 255)
    Image.new("RGB", size, color).save(output, format="PNG")
    return output.getvalue()


def _multi_place_kmz() -> bytes:
    output = BytesIO()
    placemarks = []
    for index in range(3):
        image = '<description><![CDATA[<img src="files/photo.png">]]></description>' if index == 0 else ""
        placemarks.append(
            f"<Placemark><name>KMZ Point {index + 1}</name>{image}"
            f"<Point><coordinates>{2.30 + index / 100},{48.80 + index / 100}</coordinates></Point></Placemark>"
        )
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", ("<kml><Document>" + "".join(placemarks) + "</Document></kml>").encode())
        archive.writestr("files/photo.png", _image_bytes(1))
    return output.getvalue()


def _upload_photos(client: TestClient, poi_map: PoiMap, count: int) -> list[UUID]:
    place = client.post(
        "/places",
        json={
            "name": f"Optimization {uuid4().hex}",
            "map_id": str(poi_map.id),
            "latitude": 48.0,
            "longitude": 2.0,
        },
    )
    assert place.status_code == 201
    result = []
    for index in range(count):
        uploaded = client.post(
            f"/places/{place.json()['id']}/photos/upload",
            files={"file": (f"photo-{index}.png", _image_bytes(index), "image/png")},
        )
        assert uploaded.status_code == 201
        result.append(UUID(uploaded.json()["id"]))
    return result


def _photos(session: Session, photo_ids: list[UUID]) -> list[Photo]:
    session.expire_all()
    return list(session.scalars(select(Photo).where(Photo.id.in_(photo_ids)).order_by(Photo.created_at, Photo.id)).all())


def _hashes(storage: Path, photos: list[Photo]) -> dict[UUID, str]:
    return {photo.id: sha256((storage / photo.path).read_bytes()).hexdigest() for photo in photos}


def _assert_healthy_webps(storage: Path, photos: list[Photo]) -> None:
    for photo in photos:
        assert photo.path is not None and photo.path.endswith(".webp")
        assert photo.mime_type == "image/webp"
        path = storage / photo.path
        assert path.stat().st_size == photo.file_size_bytes
        with Image.open(path) as image:
            image.load()
            assert image.format == "WEBP"
            assert image.size == (photo.width, photo.height)


def _cleanup_photos(_client: TestClient, session: Session, photo_ids: list[UUID]) -> None:
    for photo_id in photo_ids:
        photo = session.get(Photo, photo_id)
        if photo is None:
            continue
        if photo.path is not None and photo.storage_scope_id is not None:
            delete_photo_file(photo.path, photo.storage_scope_id, photo.id)
        session.delete(photo)
    session.flush()


def test_kmz_retry_after_partial_crash_commits_one_logical_import(
    integration_client: TestClient,
    database_session: Session,
    auth_user,
    poi_map: PoiMap,
    photo_storage: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(import_service, "IMPORT_ROOT", tmp_path / "imports")
    preview_response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/preview",
        files={"file": ("three-places.kmz", _multi_place_kmz(), "application/vnd.google-earth.kmz")},
    )
    assert preview_response.status_code == 200
    preview = preview_response.json()
    import_id = UUID(preview["import_id"])
    preview_row = database_session.get(KmzImportPreview, import_id)
    assert preview_row is not None
    preview_path = import_service.IMPORT_ROOT / preview_row.storage_name

    task = BackgroundTask(
        task_type=KMZ_IMPORT_TASK,
        requested_by_user_id=auth_user.id,
        map_id=poi_map.id,
        resource_type="kmz_import",
        resource_id=import_id,
        status="running",
        progress_current=0,
        progress_total=1,
        progress_message="Traitement en cours",
        input_json={
            "import_id": str(import_id),
            "selected_source_indexes": [0, 1, 2],
            "download_remote_images": False,
            "force_source_indexes": [],
        },
        attempt_count=1,
        max_attempts=3,
        lease_owner="first-executor",
        lease_expires_at=datetime.now(UTC) + timedelta(minutes=1),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    database_session.add(task)
    database_session.commit()

    created = 0

    def crash_after_first_place(_current: int, _total: int, message: str) -> None:
        nonlocal created
        if message.startswith("POI créé"):
            created += 1
            if created == 1:
                raise SystemExit("injected crash after partial place creation")

    with pytest.raises(SystemExit):
        handle_kmz_import(database_session, task, crash_after_first_place)
    database_session.rollback()
    clear_rollback_cleanups(database_session)

    assert database_session.scalar(
        select(func.count()).select_from(Place).where(Place.map_id == poi_map.id, Place.name.like("KMZ Point %"))
    ) == 0
    assert database_session.get(KmzImportPreview, import_id) is not None
    assert preview_path.is_file()

    task = database_session.get(BackgroundTask, task.id)
    assert task is not None
    task.lease_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    database_session.commit()
    recovered = claim_task(database_session, task.id, "retry-executor")
    assert recovered is not None and recovered.attempt_count == 2

    handled = handle_kmz_import(database_session, recovered, lambda *_args: None)
    assert isinstance(handled, TaskHandlerResult)
    assert _finalize_success(database_session, task.id, "retry-executor", handled.result, 4)
    clear_rollback_cleanups(database_session)
    for cleanup in handled.after_commit:
        cleanup()

    database_session.refresh(task)
    imported = list(database_session.scalars(
        select(Place).where(Place.map_id == poi_map.id, Place.name.like("KMZ Point %")).order_by(Place.name)
    ).all())
    photos = list(database_session.scalars(select(Photo).where(Photo.place_id.in_([place.id for place in imported]))).all())
    try:
        assert task.status == "succeeded"
        assert [place.name for place in imported] == ["KMZ Point 1", "KMZ Point 2", "KMZ Point 3"]
        assert len({place.id for place in imported}) == 3
        assert database_session.scalar(
            select(func.count()).select_from(Category).where(Category.map_id == poi_map.id, func.lower(Category.name) == "importé")
        ) == 1
        assert database_session.scalar(
            select(func.count()).select_from(PlaceStatus).where(PlaceStatus.map_id == poi_map.id, PlaceStatus.slug == "importe")
        ) == 1
        assert len(photos) == 1
        assert QuotaService(database_session).usage(auth_user.id, QuotaKey.PLACES_PER_MAP_MAX, poi_map.id) == 3
        assert QuotaService(database_session).usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
        assert QuotaService(database_session).storage_usage(auth_user.id) == photos[0].file_size_bytes
        assert (photo_storage / photos[0].path).is_file()
        assert database_session.get(KmzImportPreview, import_id) is None
        assert not preview_path.exists()
    finally:
        _cleanup_photos(integration_client, database_session, [photo.id for photo in photos])


def test_media_optimization_retry_skips_committed_webps_without_reencoding(
    integration_client: TestClient,
    database_session: Session,
    auth_user,
    poi_map: PoiMap,
    photo_storage: Path,
) -> None:
    photo_ids = _upload_photos(integration_client, poi_map, 3)
    try:
        first = media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        photos = _photos(database_session, photo_ids)
        _assert_healthy_webps(photo_storage, photos)
        first_hashes = _hashes(photo_storage, photos)

        second = media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        photos = _photos(database_session, photo_ids)
        _assert_healthy_webps(photo_storage, photos)

        assert first["optimized"] == 3 and first["failed"] == 0
        assert second["optimized"] == 0 and second["skipped"] == 3 and second["failed"] == 0
        assert _hashes(photo_storage, photos) == first_hashes
        assert QuotaService(database_session).storage_usage(auth_user.id) == sum(photo.file_size_bytes for photo in photos)
    finally:
        _cleanup_photos(integration_client, database_session, photo_ids)


def test_media_optimization_crash_before_first_change_retries_cleanly(
    integration_client: TestClient,
    database_session: Session,
    auth_user,
    poi_map: PoiMap,
    photo_storage: Path,
) -> None:
    photo_ids = _upload_photos(integration_client, poi_map, 2)
    before = _photos(database_session, photo_ids)
    original_paths = {photo.id: photo.path for photo in before}
    original_hashes = _hashes(photo_storage, before)

    def crash_before_first(current: int, _total: int, _message: str) -> None:
        if current == 0:
            raise SystemExit("injected crash before first modification")

    try:
        with pytest.raises(SystemExit):
            media_optimization.optimize_existing_media(database_session, object(), crash_before_first)
        database_session.rollback()
        untouched = _photos(database_session, photo_ids)
        assert {photo.id: photo.path for photo in untouched} == original_paths
        assert _hashes(photo_storage, untouched) == original_hashes

        retried = media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        photos = _photos(database_session, photo_ids)
        assert retried["optimized"] == 2 and retried["failed"] == 0
        _assert_healthy_webps(photo_storage, photos)
        assert QuotaService(database_session).storage_usage(auth_user.id) == sum(photo.file_size_bytes for photo in photos)
    finally:
        _cleanup_photos(integration_client, database_session, photo_ids)


def test_media_optimization_partial_batch_retry_preserves_committed_hashes(
    integration_client: TestClient,
    database_session: Session,
    auth_user,
    poi_map: PoiMap,
    photo_storage: Path,
) -> None:
    photo_ids = _upload_photos(integration_client, poi_map, 12)

    def crash_after_first_batch(current: int, _total: int, message: str) -> None:
        if current == 10 and "11/12" in message:
            raise SystemExit("injected crash after first committed batch")

    try:
        with pytest.raises(SystemExit):
            media_optimization.optimize_existing_media(database_session, object(), crash_after_first_batch)
        database_session.rollback()
        after_crash = _photos(database_session, photo_ids)
        committed = [photo for photo in after_crash if photo.mime_type == "image/webp"]
        pending = [photo for photo in after_crash if photo.mime_type != "image/webp"]
        assert len(committed) == 10 and len(pending) == 2
        committed_hashes = _hashes(photo_storage, committed)

        retried = media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        photos = _photos(database_session, photo_ids)
        _assert_healthy_webps(photo_storage, photos)

        assert retried["optimized"] == 2
        assert retried["skipped"] == 10
        assert retried["failed"] == 0
        assert _hashes(photo_storage, [photo for photo in photos if photo.id in committed_hashes]) == committed_hashes
        assert QuotaService(database_session).storage_usage(auth_user.id) == sum(photo.file_size_bytes for photo in photos)
    finally:
        _cleanup_photos(integration_client, database_session, photo_ids)


def test_media_optimization_crash_after_file_persist_keeps_original_recoverable(
    integration_client: TestClient,
    database_session: Session,
    auth_user,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    photo_ids = _upload_photos(integration_client, poi_map, 1)
    original = _photos(database_session, photo_ids)[0]
    original_path = photo_storage / original.path
    prepared_paths: list[Path] = []
    real_persist = media_optimization.persist_materialized_photo

    def persist_then_crash(*args, **kwargs) -> None:
        real_persist(*args, **kwargs)
        raise SystemExit("injected crash after replacement persist")

    try:
        monkeypatch.setattr(media_optimization, "persist_materialized_photo", persist_then_crash)
        with pytest.raises(SystemExit):
            media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        database_session.rollback()

        after_crash = _photos(database_session, photo_ids)[0]
        assert after_crash.path == original.path
        assert after_crash.mime_type == "image/png"
        assert original_path.is_file()
        prepared_paths = list(original_path.parent.glob(f"{original.id}.*.webp"))
        assert len(prepared_paths) == 1
        assert prepared_paths[0].is_file()

        monkeypatch.setattr(media_optimization, "persist_materialized_photo", real_persist)
        retried = media_optimization.optimize_existing_media(database_session, object(), lambda *_args: None)
        final = _photos(database_session, photo_ids)[0]

        assert retried["optimized"] == 1 and retried["failed"] == 0
        _assert_healthy_webps(photo_storage, [final])
        assert not original_path.exists()
        deep_reconcile_storage(database_session, repair=True, grace_seconds=0)
        assert not prepared_paths[0].exists()
        assert QuotaService(database_session).storage_usage(auth_user.id) == final.file_size_bytes
    finally:
        _cleanup_photos(integration_client, database_session, photo_ids)
