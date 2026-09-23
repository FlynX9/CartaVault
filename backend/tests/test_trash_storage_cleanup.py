from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.photos.models import Photo, StorageOperation
from app.photos.object_storage import LocalObjectStorage, ObjectStorageError
from app.places.models import Place
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.trash.service import purge_expired_trash
from app.trips.models import Trip, TripNightPhoto


pytestmark = pytest.mark.integration


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (8, 8), (24, 96, 160)).save(output, format="PNG")
    return output.getvalue()


def _place_with_photo(client, photo_storage: Path, map_id: UUID, name: str):
    place = client.post(
        "/places",
        json={"map_id": str(map_id), "name": name, "latitude": 48.2, "longitude": 2.2},
    ).json()
    uploaded = client.post(
        f"/places/{place['id']}/photos/upload",
        files={"file": ("audit.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    photo = uploaded.json()
    original = photo_storage / Path(photo["path"])
    thumbnail_response = client.get(f"/photos/{photo['id']}/thumbnail")
    assert thumbnail_response.status_code == 200
    thumbnail = photo_storage / ".thumbnails" / f"{photo['id']}.webp"
    assert original.is_file() and thumbnail.is_file()
    return place, photo, original, thumbnail


def _trip_with_night_photo(client, photo_storage: Path, map_id: UUID):
    trip = client.post(f"/maps/{map_id}/trips", json={"name": "Purge trip"}).json()
    second_day = client.post(f"/trips/{trip['id']}/days", json={}).json()
    night = client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": trip["days"][0]["id"],
            "next_day_id": second_day["id"],
            "name": "Purge night",
            "latitude": 48.3,
            "longitude": 2.3,
        },
    ).json()
    uploaded = client.post(
        f"/trip-nights/{night['id']}/photos",
        files={"file": ("night.png", _png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 200, uploaded.text
    photo_id = UUID(uploaded.json()["photo_id"])
    original = next((photo_storage / str(night["id"])).glob(f"{photo_id}.*"))
    assert original.is_file()
    return trip, night, photo_id, original


def test_expired_map_maintenance_purges_database_original_and_thumbnail(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
) -> None:
    place, photo, original, thumbnail = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Map purge media"
    )
    photo_row = database_session.get(Photo, photo["id"])
    assert photo_row is not None
    photo_row.map_id = None  # Historical attached rows may predate map ownership metadata.
    database_session.commit()
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    quotas = QuotaService(database_session)
    assert quotas.usage(poi_map.owner_id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.storage_usage(poi_map.owner_id) > 0
    poi_map.purge_after = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database_session.commit()

    result = purge_expired_trash(database_session)

    assert result["maps"] == 1
    assert database_session.get(Place, place["id"]) is None
    assert database_session.get(Photo, photo["id"]) is None
    assert quotas.usage(poi_map.owner_id, QuotaKey.PHOTOS_TOTAL_MAX) == 0
    assert quotas.storage_usage(poi_map.owner_id) == 0
    assert not original.exists()
    assert not thumbnail.exists()


def test_permanent_place_delete_cleans_original_and_thumbnail_after_commit(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
    monkeypatch,
) -> None:
    place, photo, original, thumbnail = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Place purge media"
    )
    assert integration_client.delete(f"/places/{place['id']}").status_code == 204
    committed = False
    real_commit = database_session.commit
    cleanup_after_commit: list[bool] = []

    def tracked_commit():
        nonlocal committed
        real_commit()
        committed = True

    backend = LocalObjectStorage(photo_storage)
    real_delete = backend.delete

    def tracked_delete(key):
        cleanup_after_commit.append(committed)
        return real_delete(key)

    monkeypatch.setattr(database_session, "commit", tracked_commit)
    backend.delete = tracked_delete
    monkeypatch.setattr("app.photos.reconciliation._backend", lambda _namespace: backend)

    response = integration_client.delete(f"/trash/place/{place['id']}")

    assert response.status_code == 204
    assert cleanup_after_commit == [True, True]
    assert database_session.get(Photo, photo["id"]) is None
    assert not original.exists()
    assert not thumbnail.exists()


def test_permanent_trip_delete_cleans_night_photo_after_commit(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
) -> None:
    trip, _night, photo_id, original = _trip_with_night_photo(
        integration_client, photo_storage, poi_map.id
    )
    assert integration_client.delete(f"/trips/{trip['id']}").status_code == 204

    response = integration_client.delete(f"/trash/trip/{trip['id']}")

    assert response.status_code == 204
    assert database_session.get(Trip, trip["id"]) is None
    assert database_session.get(TripNightPhoto, photo_id) is None
    assert not original.exists()


def test_storage_failure_does_not_rollback_committed_purge_and_continues(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
    monkeypatch,
) -> None:
    first, first_photo, first_original, _ = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Storage error one"
    )
    second, second_photo, second_original, _ = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Storage error two"
    )
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    backend = LocalObjectStorage(photo_storage)
    real_delete = backend.delete
    calls = 0
    warnings: list[str] = []

    def flaky_delete(key):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ObjectStorageError("injected cleanup failure")
        return real_delete(key)

    backend.delete = flaky_delete
    monkeypatch.setattr("app.photos.reconciliation._backend", lambda _namespace: backend)
    monkeypatch.setattr(
        "app.trash.service.logger.warning",
        lambda message, *args, **kwargs: warnings.append(message),
    )

    response = integration_client.delete(f"/trash/map/{poi_map.id}")

    assert response.status_code == 204
    assert database_session.get(Place, first["id"]) is None
    assert database_session.get(Place, second["id"]) is None
    assert database_session.get(Photo, first_photo["id"]) is None
    assert database_session.get(Photo, second_photo["id"]) is None
    assert calls == 4
    assert first_original.exists() != second_original.exists()
    assert database_session.scalar(select(StorageOperation).where(StorageOperation.status == "pending")) is not None
    first_original.unlink(missing_ok=True)
    second_original.unlink(missing_ok=True)


def test_database_failure_rolls_back_without_touching_storage(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
    monkeypatch,
) -> None:
    place, _photo, original, thumbnail = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Rollback media"
    )
    assert integration_client.delete(f"/places/{place['id']}").status_code == 204
    rollback_calls = 0
    delete_calls = 0
    real_rollback = database_session.rollback

    def failed_commit():
        raise SQLAlchemyError("injected commit failure")

    def tracked_rollback():
        nonlocal rollback_calls
        rollback_calls += 1
        return real_rollback()

    def tracked_delete(*_args, **_kwargs):
        nonlocal delete_calls
        delete_calls += 1

    monkeypatch.setattr(database_session, "commit", failed_commit)
    monkeypatch.setattr(database_session, "rollback", tracked_rollback)
    monkeypatch.setattr("app.trash.service.process_storage_operations_best_effort", tracked_delete)

    with pytest.raises(SQLAlchemyError, match="injected commit failure"):
        integration_client.delete(f"/trash/place/{place['id']}")

    assert rollback_calls == 1
    assert delete_calls == 0
    assert original.is_file() and thumbnail.is_file()
    original.unlink()
    thumbnail.unlink()


def test_historically_shared_path_is_not_deleted_while_still_referenced(
    integration_client,
    database_session,
    photo_storage,
    poi_map,
) -> None:
    first, first_photo, original, thumbnail = _place_with_photo(
        integration_client, photo_storage, poi_map.id, "Shared source"
    )
    second = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "Shared survivor", "latitude": 48.3, "longitude": 2.3},
    ).json()
    survivor = Photo(
        id=uuid4(),
        place_id=UUID(second["id"]),
        map_id=poi_map.id,
        storage_scope_id=UUID(first["id"]),
        filename="historical.png",
        path=first_photo["path"],
        sort_order=0,
    )
    database_session.add(survivor)
    database_session.commit()
    assert integration_client.delete(f"/places/{first['id']}").status_code == 204

    response = integration_client.delete(f"/trash/place/{first['id']}")

    assert response.status_code == 204
    assert database_session.scalar(select(Photo).where(Photo.id == survivor.id)) is not None
    assert original.is_file()
    assert integration_client.delete(f"/places/{second['id']}").status_code == 204
    assert integration_client.delete(f"/trash/place/{second['id']}").status_code == 204
    assert not original.exists()
    assert not thumbnail.exists()
