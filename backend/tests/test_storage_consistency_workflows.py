from __future__ import annotations

from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.maps.models import PoiMap
from app.media import optimization as media_optimization
from app.photos import reconciliation
from app.photos.models import Photo, StorageOperation
from app.photos.object_storage import ObjectStorageError
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


pytestmark = pytest.mark.integration


def _image_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (32, 24), (30, 90, 150)).save(output, "PNG")
    return output.getvalue()


def _create_place(client: TestClient, poi_map: PoiMap) -> str:
    response = client.post(
        "/places",
        json={
            "name": "Storage consistency",
            "map_id": str(poi_map.id),
            "latitude": 48.85,
            "longitude": 2.35,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _upload(client: TestClient, place_id: str) -> dict:
    response = client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": ("consistency.png", _image_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_photo_upload_db_failure_leaves_durable_cleanup_and_no_quota(
    integration_client: TestClient,
    database_session,
    test_engine,
    auth_user,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    place_id = _create_place(integration_client, poi_map)
    quota = QuotaService(database_session)
    before_count = quota.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX)
    before_bytes = quota.storage_usage(auth_user.id)
    real_commit = database_session.commit

    def fail_commit() -> None:
        raise SQLAlchemyError("injected photo metadata failure")

    monkeypatch.setattr(database_session, "commit", fail_commit)
    response = integration_client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": ("failed.png", _image_bytes(), "image/png")},
    )
    monkeypatch.setattr(database_session, "commit", real_commit)

    assert response.status_code == 500
    assert database_session.scalar(select(func.count()).select_from(Photo)) == before_count
    assert quota.storage_usage(auth_user.id) == before_bytes

    with Session(test_engine, expire_on_commit=False) as cleanup:
        operation = cleanup.scalar(
            select(StorageOperation).where(StorageOperation.purpose == "write_cleanup")
        )
        assert operation is not None
        assert reconciliation.process_storage_operation(
            cleanup, operation.id, force_terminal=True
        )
        cleanup.commit()


def test_rejected_photo_upload_consumes_prepared_cleanup_intent(
    integration_client: TestClient,
    database_session,
    poi_map: PoiMap,
) -> None:
    place_id = _create_place(integration_client, poi_map)

    response = integration_client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": ("invalid.png", b"not-an-image", "image/png")},
    )

    assert response.status_code == 415
    assert database_session.scalar(select(func.count()).select_from(StorageOperation)) == 0


def test_thumbnail_refresh_is_consumed_before_regeneration(
    integration_client: TestClient,
    database_session,
    photo_storage: Path,
    poi_map: PoiMap,
) -> None:
    place_id = _create_place(integration_client, poi_map)
    uploaded = _upload(integration_client, place_id)
    first = integration_client.get(f"/photos/{uploaded['id']}/thumbnail")
    assert first.status_code == 200
    photo = database_session.get(Photo, uploaded["id"])
    assert photo is not None and photo.path is not None
    replacement = BytesIO()
    Image.new("RGB", (32, 24), (180, 20, 40)).save(replacement, "PNG")
    (photo_storage / photo.path).write_bytes(replacement.getvalue())
    operation_id = reconciliation.enqueue_delete_intent(
        database_session,
        backend="local",
        namespace="media",
        object_key=reconciliation.thumbnail_object_key(photo.id),
        purpose="thumbnail_refresh",
    )
    database_session.commit()

    refreshed = integration_client.get(f"/photos/{photo.id}/thumbnail")

    assert refreshed.status_code == 200
    assert refreshed.content != first.content
    assert database_session.get(StorageOperation, operation_id) is None
    assert integration_client.delete(f"/photos/{photo.id}").status_code == 204


def test_photo_delete_failure_is_durable_and_quota_follows_logical_state(
    integration_client: TestClient,
    database_session,
    photo_storage: Path,
    auth_user,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    place_id = _create_place(integration_client, poi_map)
    uploaded = _upload(integration_client, place_id)
    photo = database_session.get(Photo, uploaded["id"])
    assert photo is not None and photo.path is not None
    physical = photo_storage / photo.path
    assert physical.is_file()

    failing_backend = Mock()
    failing_backend.delete.side_effect = ObjectStorageError("injected unlink failure")
    real_backend = reconciliation._backend
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: failing_backend)

    response = integration_client.delete(f"/photos/{photo.id}")

    assert response.status_code == 204
    assert database_session.get(Photo, photo.id) is None
    assert QuotaService(database_session).usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 0
    assert QuotaService(database_session).storage_usage(auth_user.id) == 0
    assert physical.is_file()
    operation = database_session.scalar(
        select(StorageOperation).where(
            StorageOperation.object_key == photo.path,
            StorageOperation.purpose == "photo_delete",
        )
    )
    assert operation is not None and operation.attempt_count == 1
    assert operation.status == "pending"

    monkeypatch.setattr(reconciliation, "_backend", real_backend)
    operation.next_attempt_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    assert reconciliation.process_storage_operation(
        database_session, operation.id, force_terminal=True
    )
    database_session.commit()
    assert not physical.exists()


def test_media_optimization_failed_old_delete_is_retryable(
    integration_client: TestClient,
    database_session,
    photo_storage: Path,
    poi_map: PoiMap,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    place_id = _create_place(integration_client, poi_map)
    uploaded = _upload(integration_client, place_id)
    photo = database_session.get(Photo, uploaded["id"])
    assert photo is not None and photo.path is not None
    original_path = photo.path
    original = photo_storage / original_path

    failing_backend = Mock()
    failing_backend.delete.side_effect = ObjectStorageError("injected old-original failure")
    real_backend = reconciliation._backend
    monkeypatch.setattr(reconciliation, "_backend", lambda _namespace: failing_backend)

    result = media_optimization.optimize_existing_media(
        database_session, object(), lambda *_args: None
    )
    database_session.refresh(photo)

    assert result["optimized"] == 1
    assert photo.path is not None and photo.path.endswith(".webp")
    replacement = photo_storage / photo.path
    assert replacement.is_file()
    assert original.is_file()
    operation = database_session.scalar(
        select(StorageOperation).where(
            StorageOperation.object_key == original_path,
            StorageOperation.purpose == "optimization_replaced_original",
        )
    )
    assert operation is not None and operation.status == "pending"

    monkeypatch.setattr(reconciliation, "_backend", real_backend)
    assert reconciliation.process_storage_operation(
        database_session, operation.id, force_terminal=True
    )
    database_session.commit()
    assert not original.exists()
    assert replacement.is_file()

    response = integration_client.delete(f"/photos/{photo.id}")
    assert response.status_code == 204
