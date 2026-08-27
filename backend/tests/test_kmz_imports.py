from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.models import User
from app.imports.remote_images import DownloadedRemoteImage
from app.maps.models import PoiMap
from app.imports.remote_images import RemoteImageError
from app.imports.service import confirm_import, get_cached_import
from app.photos.models import Photo
from app.photos.storage import PhotoStorageError, delete_photo_file
from app.places.models import Place
from app.quotas.models import QuotaProfile
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


pytestmark = pytest.mark.integration


def kmz_payload() -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", b"<kml><Placemark><name>Point importe</name><ExtendedData><Data name='Architecte'><value>Jane Doe</value></Data></ExtendedData><Point><coordinates>2.35,48.85</coordinates></Point></Placemark></kml>")
    return output.getvalue()


PNG_BYTES = b"\x89PNG\r\n\x1a\nkmz-image"


def image_kmz_payload(*, embedded: int = 0, remote: int = 0) -> bytes:
    image_tags = [f'<img src="files/photo-{index}.png">' for index in range(embedded)]
    image_tags.extend(
        f'<img src="https://mymaps.usercontent.google.com/photo-{index}">' for index in range(remote)
    )
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "doc.kml",
            (
                "<kml><Placemark><name>Point avec images</name><description><![CDATA["
                + "".join(image_tags)
                + "]]></description><Point><coordinates>2.36,48.86</coordinates></Point></Placemark></kml>"
            ).encode(),
        )
        for index in range(embedded):
            archive.writestr(f"files/photo-{index}.png", PNG_BYTES)
    return output.getvalue()


def remote_images_kmz_payload(*urls: str) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "doc.kml",
            (
                "<kml><Placemark><name>Point avec images distantes</name><description><![CDATA["
                + "".join(f'<img src="{url}">' for url in urls)
                + "]]></description><Point><coordinates>2.36,48.86</coordinates></Point></Placemark></kml>"
            ).encode(),
        )
    return output.getvalue()


def preview_import(integration_client: TestClient, poi_map: PoiMap, payload: bytes) -> dict:
    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/preview",
        files={"file": ("images.kmz", payload, "application/vnd.google-earth.kmz")},
    )
    assert response.status_code == 200
    return response.json()


def set_storage_limit(database_session: Session, auth_user: User, limit: int) -> None:
    profile = QuotaProfile(name=f"KMZ {uuid4()}", is_active=True, storage_bytes_max=limit)
    database_session.add(profile)
    database_session.flush()
    auth_user.quota_profile_id = profile.id
    database_session.commit()


def set_photo_limit(database_session: Session, auth_user: User, limit: int) -> None:
    profile = QuotaProfile(name=f"KMZ photos {uuid4()}", is_active=True, photos_total_max=limit)
    database_session.add(profile)
    database_session.flush()
    auth_user.quota_profile_id = profile.id
    database_session.commit()


def test_progress_import_keeps_poi_when_remote_image_fails(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_download(_url: str):
        raise RemoteImageError("unavailable")

    monkeypatch.setattr("app.imports.service.download_remote_image", fail_download)
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "doc.kml",
            b'''<kml><Placemark><name>Point avec image</name><description><![CDATA[<img src="https://mymaps.usercontent.google.com/photo">]]></description><Point><coordinates>2.36,48.86</coordinates></Point></Placemark></kml>''',
        )
    preview = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/preview",
        files={"file": ("images.kmz", output.getvalue(), "application/vnd.google-earth.kmz")},
    )
    assert preview.status_code == 200
    preview_body = preview.json()

    progress_updates: list[tuple[int, int, str]] = []
    cached = get_cached_import(
        database_session,
        UUID(preview_body["import_id"]),
        poi_map.id,
        auth_user.id,
    )
    report = confirm_import(
        database_session,
        poi_map.id,
        cached,
        [0],
        download_remote_images=True,
        progress_callback=lambda completed, total, message: progress_updates.append(
            (completed, total, message)
        ),
    )

    assert report.created_count == 1
    assert report.remote_images_unavailable == 1
    assert report.warnings
    assert progress_updates[-1][0] == progress_updates[-1][1]


def test_preview_then_confirm_creates_an_imported_place(integration_client: TestClient, poi_map: PoiMap) -> None:
    preview = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/preview", files={"file": ("places.kmz", kmz_payload(), "application/vnd.google-earth.kmz")})
    assert preview.status_code == 200
    body = preview.json()
    assert body["valid_count"] == 1
    assert body["items"][0]["custom_fields"] == {"Architecte": "Jane Doe"}

    confirmed = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/confirm", json={"import_id": body["import_id"], "selected_source_indexes": [0]})
    assert confirmed.status_code == 201
    assert confirmed.json()["created_count"] == 1
    place_id = confirmed.json()["created_place_ids"][0]
    place = integration_client.get(f"/places/{place_id}")
    assert place.status_code == 200
    assert place.json()["custom_fields"] == {"Architecte": "Jane Doe"}
    assert place.json()["categories"][0]["name"] == "Importé"
    assert place.json()["status"]["name"] == "Importé"

    repeated_preview = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/preview",
        files={"file": ("places.kmz", kmz_payload(), "application/vnd.google-earth.kmz")},
    )
    assert repeated_preview.status_code == 200
    assert repeated_preview.json()["items"][0]["already_imported"] is True
    assert repeated_preview.json()["items"][0]["duplicate_reason"] == "existing_map"


def test_embedded_image_import_persists_complete_media_and_exact_storage_usage(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    photo_storage: Path,
) -> None:
    preview = preview_import(integration_client, poi_map, image_kmz_payload(embedded=1))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={"import_id": preview["import_id"], "selected_source_indexes": [0]},
    )

    assert response.status_code == 201
    photo = database_session.scalar(select(Photo))
    assert photo is not None
    assert photo.map_id == poi_map.id
    assert photo.storage_scope_id == photo.place_id
    assert photo.file_size_bytes == len(PNG_BYTES)
    assert (photo_storage / photo.path).read_bytes() == PNG_BYTES
    assert QuotaService(database_session).usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == len(PNG_BYTES)
    delete_photo_file(photo.path, photo.storage_scope_id, photo.id)


def test_remote_image_uses_actual_downloaded_bytes_without_content_length(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = PNG_BYTES + b"-remote"
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=payload, mime_type="image/png"),
    )
    set_storage_limit(database_session, auth_user, len(payload))
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 201
    assert QuotaService(database_session).usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == len(payload)
    photo = database_session.scalar(select(Photo))
    assert photo is not None
    delete_photo_file(photo.path, photo.storage_scope_id, photo.id)


def test_remote_image_exceeding_storage_quota_rolls_back_database_and_storage(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = PNG_BYTES + b"-too-large"
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=payload, mime_type="image/png"),
    )
    set_storage_limit(database_session, auth_user, len(payload) - 1)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.storage_bytes.limit_reached"
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0
    assert not [path for path in photo_storage.rglob("*") if path.is_file()]


def test_remote_image_failing_local_media_validation_keeps_task_successful_with_one_warning(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=PNG_BYTES, mime_type="image/jpeg"),
    )
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))

    started = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm-jobs",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )
    assert started.status_code == 202
    progress = integration_client.get(
        f"/maps/{poi_map.id}/imports/kmz/confirm-jobs/{started.json()['job_id']}"
    )

    assert progress.status_code == 200
    assert progress.json()["status"] == "completed"
    report = progress.json()["report"]
    assert report["created_count"] == 1
    assert report["remote_images_unavailable"] == 1
    assert len(report["warnings"]) == 1
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0


def test_remote_image_warning_does_not_stop_later_remote_images(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unavailable = "https://mymaps.usercontent.google.com/unavailable"
    available = "https://mymaps.usercontent.google.com/available"

    def download(url: str) -> DownloadedRemoteImage:
        if url == unavailable:
            raise RemoteImageError("not found")
        return DownloadedRemoteImage(payload=PNG_BYTES, mime_type="image/png")

    monkeypatch.setattr("app.imports.service.download_remote_image", download)
    preview = preview_import(integration_client, poi_map, remote_images_kmz_payload(unavailable, available))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["remote_images_added"] == 1
    assert response.json()["remote_images_unavailable"] == 1
    assert len(response.json()["warnings"]) == 1
    photo = database_session.scalar(select(Photo))
    assert photo is not None
    delete_photo_file(photo.path, photo.storage_scope_id, photo.id)


def test_remote_image_exceeding_photo_quota_fails_the_import(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=PNG_BYTES, mime_type="image/png"),
    )
    set_photo_limit(database_session, auth_user, 0)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.photos_total.limit_reached"
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0


def test_remote_internal_storage_failure_rolls_back_the_import(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.imports import service as import_service

    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=PNG_BYTES, mime_type="image/png"),
    )

    def fail_storage(*_args, **_kwargs):
        raise PhotoStorageError("storage unavailable")

    monkeypatch.setattr(import_service, "store_photo_file", fail_storage)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 500
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0
    assert not [path for path in photo_storage.rglob("*") if path.is_file()]


def test_storage_quota_exceeded_by_second_remote_image_rolls_back_all_images(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = PNG_BYTES + b"-remote"
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=payload, mime_type="image/png"),
    )
    set_storage_limit(database_session, auth_user, len(payload) * 2 - 1)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=2))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={
            "import_id": preview["import_id"],
            "selected_source_indexes": [0],
            "download_remote_images": True,
        },
    )

    assert response.status_code == 409
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0
    assert not [path for path in photo_storage.rglob("*") if path.is_file()]


def test_storage_failure_on_second_image_rolls_back_every_import_artifact(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.imports import service as import_service

    real_store = import_service.store_photo_file
    calls = 0

    def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise PhotoStorageError("injected storage failure")
        return real_store(*args, **kwargs)

    monkeypatch.setattr(import_service, "store_photo_file", fail_second)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(embedded=2))

    response = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm",
        json={"import_id": preview["import_id"], "selected_source_indexes": [0]},
    )

    assert response.status_code == 500
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert database_session.scalar(select(func.count()).select_from(Photo)) == 0
    assert not [path for path in photo_storage.rglob("*") if path.is_file()]


def test_confirm_import_never_commits_the_callers_transaction(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    preview = preview_import(integration_client, poi_map, kmz_payload())
    cached = get_cached_import(database_session, UUID(preview["import_id"]), poi_map.id, auth_user.id)
    commits = 0

    def record_commit() -> None:
        nonlocal commits
        commits += 1

    monkeypatch.setattr(database_session, "commit", record_commit)

    report = confirm_import(database_session, poi_map.id, cached, [0])

    assert report.created_count == 1
    assert commits == 0
    database_session.rollback()


def test_preview_cleanup_failure_does_not_turn_committed_task_into_failure(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.imports import service as import_service

    monkeypatch.setattr(import_service, "IMPORT_ROOT", tmp_path)
    preview = preview_import(integration_client, poi_map, kmz_payload())
    real_unlink = Path.unlink

    def fail_preview_cleanup(path: Path, *args, **kwargs):
        if path.parent == tmp_path:
            raise OSError("injected preview cleanup failure")
        return real_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", fail_preview_cleanup)

    started = integration_client.post(
        f"/maps/{poi_map.id}/imports/kmz/confirm-jobs",
        json={"import_id": preview["import_id"], "selected_source_indexes": [0]},
    )
    assert started.status_code == 202
    progress = integration_client.get(
        f"/maps/{poi_map.id}/imports/kmz/confirm-jobs/{started.json()['job_id']}"
    )

    assert progress.status_code == 200
    assert progress.json()["status"] == "completed"
    assert progress.json()["report"]["created_count"] == 1
    assert database_session.scalar(select(func.count()).select_from(Place)) == 1


def test_successful_confirmation_consumes_preview_and_cannot_be_reexecuted(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
) -> None:
    preview = preview_import(integration_client, poi_map, kmz_payload())
    request = {"import_id": preview["import_id"], "selected_source_indexes": [0]}

    first = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/confirm", json=request)
    second = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/confirm", json=request)

    assert first.status_code == 201
    assert second.status_code == 410
    assert database_session.scalar(select(func.count()).select_from(Place)) == 1


def test_failed_task_leaves_no_import_and_preview_can_be_retried(
    integration_client: TestClient,
    database_session: Session,
    auth_user: User,
    poi_map: PoiMap,
    photo_storage: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = PNG_BYTES + b"-retry"
    monkeypatch.setattr(
        "app.imports.service.download_remote_image",
        lambda _url: DownloadedRemoteImage(payload=payload, mime_type="image/png"),
    )
    set_storage_limit(database_session, auth_user, len(payload) - 1)
    preview = preview_import(integration_client, poi_map, image_kmz_payload(remote=1))
    request = {
        "import_id": preview["import_id"],
        "selected_source_indexes": [0],
        "download_remote_images": True,
    }

    started = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/confirm-jobs", json=request)
    assert started.status_code == 202, started.text
    progress = integration_client.get(
        f"/maps/{poi_map.id}/imports/kmz/confirm-jobs/{started.json()['job_id']}"
    )

    assert progress.status_code == 200, progress.text
    assert progress.json()["status"] == "failed"
    assert database_session.scalar(select(func.count()).select_from(Place)) == 0
    assert not [path for path in photo_storage.rglob("*") if path.is_file()]

    profile = database_session.get(QuotaProfile, auth_user.quota_profile_id)
    assert profile is not None
    profile.storage_bytes_max = len(payload)
    database_session.commit()
    retried = integration_client.post(f"/maps/{poi_map.id}/imports/kmz/confirm", json=request)

    assert retried.status_code == 201
    assert database_session.scalar(select(func.count()).select_from(Place)) == 1
    photo = database_session.scalar(select(Photo))
    assert photo is not None
    delete_photo_file(photo.path, photo.storage_scope_id, photo.id)
