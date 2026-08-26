"""AUD-013: duplicated maps must own physically independent media files."""

import hashlib
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path, PurePosixPath
from uuid import UUID, uuid4

import pytest
from PIL import Image
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.testclient import TestClient

from app.maps.duplication import _copy as original_copy
from app.maps import duplication as duplication_module
from app.photos.storage import delete_photo_thumbnail
from app.photos.models import Photo
from app.places.models import Place
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.trips.models import Trip, TripNight, TripNightPhoto

pytestmark = pytest.mark.integration


def jpeg_payload(tag: str) -> bytes:
    """Real decodable JPEG; the tint encodes the tag so contents differ."""

    buffer = BytesIO()
    tint = sum(tag.encode()) % 200 + 20
    Image.new("RGB", (8, 6), color=(tint, 40, 90)).save(buffer, format="JPEG")
    return buffer.getvalue()


def upload_place_photo(client: TestClient, place_id: str, tag: str) -> dict:
    uploaded = client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": (f"{tag}.jpg", jpeg_payload(tag), "image/jpeg")},
    )
    assert uploaded.status_code == 201, uploaded.text
    return uploaded.json()


def create_place(client: TestClient, poi_map_id: str, name: str) -> str:
    created = client.post(
        "/places",
        json={"name": name, "map_id": poi_map_id, "latitude": 45.764, "longitude": 4.8357},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def assert_path_identity(relative_path: str, scope_id: UUID | None, media_id: UUID) -> None:
    """The stored key must encode the copy's own scope and id."""

    directory, filename = PurePosixPath(relative_path).parts
    assert UUID(directory) == scope_id
    assert UUID(Path(filename).stem) == media_id


def discard_photo(client: TestClient, photo_id: str) -> None:
    deleted = client.delete(f"/photos/{photo_id}")
    assert deleted.status_code == 204, deleted.text


def count_maps(database_session) -> int:
    from app.maps.models import PoiMap

    return len(database_session.scalars(select(PoiMap.id)).all())


def test_duplicate_without_media_succeeds(integration_client: TestClient, poi_map, database_session) -> None:
    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Sans médias"})
    assert duplicated.status_code == 201, duplicated.text


def test_duplicate_copies_photos_with_independent_physical_files(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
) -> None:
    place_id = create_place(integration_client, str(poi_map.id), "Avec photo")
    source = upload_place_photo(integration_client, place_id, "source")
    source_bytes = jpeg_payload("source")
    source_row = database_session.get(Photo, UUID(source["id"]))
    assert source_row is not None

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Copie médias"})
    assert duplicated.status_code == 201, duplicated.text
    copied_map_id = duplicated.json()["id"]

    copied_rows = list(database_session.execute(
        select(Photo).join(Place, Photo.place_id == Place.id).where(Place.map_id == UUID(copied_map_id))
    ).scalars())
    assert len(copied_rows) == 1
    copy_row = copied_rows[0]

    # Logical identity is fresh and correctly remapped.
    assert copy_row.id != source_row.id
    assert str(copy_row.place_id) != place_id
    assert str(copy_row.map_id) == copied_map_id
    # Physical identity is fully independent.
    assert copy_row.path != source_row.path
    assert copy_row.storage_scope_id != source_row.storage_scope_id
    assert_path_identity(copy_row.path, copy_row.storage_scope_id, copy_row.id)

    downloaded = integration_client.get(f"/photos/{copy_row.id}/file")
    assert downloaded.status_code == 200, downloaded.text
    assert hashlib.sha256(downloaded.content).hexdigest() == hashlib.sha256(source_bytes).hexdigest()

    thumbnail = integration_client.get(f"/photos/{copy_row.id}/thumbnail")
    assert thumbnail.status_code == 200

    # Deleting the copy must never harm the source blob (and the reverse).
    discard_photo(integration_client, str(copy_row.id))
    assert integration_client.get(f"/photos/{source['id']}/file").status_code == 200
    assert integration_client.get(f"/photos/{source['id']}/thumbnail").status_code == 200

    discard_photo(integration_client, source["id"])

    for touched_id in (str(copy_row.id), source["id"]):
        try:
            delete_photo_thumbnail(UUID(touched_id))
        except Exception:
            pass


def test_duplicate_multiple_photos_preserve_order_primary_and_unique_paths(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
) -> None:
    place_id = create_place(integration_client, str(poi_map.id), "Multi photos")
    uploads = [upload_place_photo(integration_client, place_id, f"multi-{index}") for index in range(3)]

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Multi"})
    assert duplicated.status_code == 201, duplicated.text
    copied_map_id = duplicated.json()["id"]

    copies = list(database_session.execute(
        select(Photo).join(Place, Photo.place_id == Place.id).where(Place.map_id == UUID(copied_map_id))
    ).scalars())
    assert len(copies) == 3
    assert len({copy.path for copy in copies}) == 3
    assert sum(1 for copy in copies if copy.is_primary) == 1
    for copy in copies:
        assert copy.place_id is not None
        assert_path_identity(copy.path, copy.storage_scope_id, copy.id)

    source_sorted = sorted(uploads, key=lambda item: item["sort_order"])
    copy_sorted = sorted(copies, key=lambda item: item.sort_order)
    assert [item["sort_order"] for item in source_sorted] == [item.sort_order for item in copy_sorted]
    assert [bool(item["is_primary"]) for item in source_sorted] == [item.is_primary for item in copy_sorted]

    for copy in copies:
        discard_photo(integration_client, str(copy.id))
    for upload in uploads:
        discard_photo(integration_client, upload["id"])


def test_duplicate_copies_trip_night_photos(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Voyage nuits"}).json()
    first_day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    second_day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    created_night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": first_day["id"],
            "next_day_id": second_day["id"],
            "name": "Hôtel",
            "latitude": 48.4,
            "longitude": 2.3,
        },
    )
    assert created_night.status_code == 201, created_night.text
    night = created_night.json()
    uploaded = integration_client.post(
        f"/trip-nights/{night['id']}/photos",
        files={"file": ("hotel.jpg", jpeg_payload("nuit"), "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Nuits copiées"})
    assert duplicated.status_code == 201, duplicated.text
    copied_map_id = duplicated.json()["id"]

    copied_trip = database_session.scalar(select(Trip).where(Trip.map_id == UUID(copied_map_id)))
    assert copied_trip is not None and copied_trip.id != UUID(trip["id"])
    copied_night = database_session.scalar(select(TripNight).where(TripNight.trip_id == copied_trip.id))
    assert copied_night is not None and copied_night.id != UUID(night["id"])
    copied_photo = database_session.scalar(select(TripNightPhoto).where(TripNightPhoto.night_id == copied_night.id))
    assert copied_photo is not None

    source_night_photo = database_session.scalar(select(TripNightPhoto).where(TripNightPhoto.night_id == UUID(night["id"])))
    assert source_night_photo is not None
    assert copied_photo.file_path != source_night_photo.file_path
    assert copied_photo.night_id == copied_night.id
    assert_path_identity(copied_photo.file_path, copied_night.id, copied_photo.id)

    served = integration_client.get(f"/trip-nights/{copied_night.id}/photos/{copied_photo.id}")
    assert served.status_code == 200, served.text
    assert served.content == jpeg_payload("nuit")

    removed_copy = integration_client.delete(f"/trip-nights/{copied_night.id}/photos/{copied_photo.id}")
    assert removed_copy.status_code == 200
    still_there = integration_client.get(f"/trip-nights/{night['id']}/photos/{source_night_photo.id}")
    assert still_there.status_code == 200 and still_there.content == jpeg_payload("nuit")
    assert integration_client.delete(f"/trip-nights/{night['id']}/photos/{source_night_photo.id}").status_code == 200


def test_storage_failure_mid_duplication_compensates_and_rolls_back(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.photos import storage as photo_storage_module
    from app.photos.storage import PhotoStorageError

    place_id = create_place(integration_client, str(poi_map.id), "Trois photos")
    uploads = [upload_place_photo(integration_client, place_id, f"fail-{index}") for index in range(3)]

    real_copy = photo_storage_module.copy_photo_file
    calls = {"count": 0}

    def failing_copy(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 3:
            raise PhotoStorageError("injected copy failure")
        return real_copy(*args, **kwargs)

    monkeypatch.setattr(duplication_module, "copy_photo_file", failing_copy)

    maps_before = count_maps(database_session)
    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Échec copie"})
    assert duplicated.status_code == 500
    assert count_maps(database_session) == maps_before

    photos_after = database_session.scalars(select(Photo).where(Photo.place_id == UUID(place_id))).all()
    assert {photo.id for photo in photos_after} == {UUID(item["id"]) for item in uploads}

    # Compensation removed every partially copied physical file.
    stored_files = {path for path in photo_storage.rglob("*") if path.is_file()}
    expected_sources = {photo_storage / item["path"] for item in uploads}
    assert stored_files == expected_sources

    for upload in uploads:
        assert integration_client.get(f"/photos/{upload['id']}/file").status_code == 200
        discard_photo(integration_client, upload["id"])


def test_db_failure_after_media_copy_compensates(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    place_id = create_place(integration_client, str(poi_map.id), "Échec DB")
    upload = upload_place_photo(integration_client, place_id, "db-fail")
    integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Trip pour échec"})

    def failing_copy(instance, model, session, **overrides):
        if model is Trip:
            raise SQLAlchemyError("injected db failure")
        return original_copy(instance, model, session, **overrides)

    monkeypatch.setattr(duplication_module, "_copy", failing_copy)

    maps_before = count_maps(database_session)
    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Échec DB"})
    assert duplicated.status_code == 500
    assert count_maps(database_session) == maps_before

    stored_files = {path for path in photo_storage.rglob("*") if path.is_file()}
    assert stored_files == {photo_storage / upload["path"]}

    assert integration_client.get(f"/photos/{upload['id']}/file").status_code == 200
    discard_photo(integration_client, upload["id"])


def test_late_quota_refusal_leaves_no_partial_media(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    place_id = create_place(integration_client, str(poi_map.id), "Quota refusé")
    upload = upload_place_photo(integration_client, place_id, "quota")

    real_ensure = QuotaService.ensure_can_create

    def refusing_ensure(self, user_id, key, *, scope_id=None, increment=1):
        if key == QuotaKey.PHOTOS_PER_PLACE_MAX:
            raise HTTPException(status_code=409, detail="quota refused during duplication")
        return real_ensure(self, user_id, key, scope_id=scope_id, increment=increment)

    monkeypatch.setattr(QuotaService, "ensure_can_create", refusing_ensure)

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Quota"})
    assert duplicated.status_code == 409

    stored_files = {path for path in photo_storage.rglob("*") if path.is_file()}
    assert stored_files == {photo_storage / upload["path"]}
    assert integration_client.get(f"/photos/{upload['id']}/file").status_code == 200
    discard_photo(integration_client, upload["id"])


def test_duplicate_counts_map_scoped_orphans_in_destination_quota(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
) -> None:
    """AUD-017/AUD-013: copied orphans are real blobs and must be charged."""

    uploaded = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id)},
        files={"file": ("orphelin.jpg", jpeg_payload("orphelin"), "image/jpeg")},
    )
    assert uploaded.status_code == 201, uploaded.text
    source_orphan = database_session.get(Photo, UUID(uploaded.json()["id"]))
    assert source_orphan is not None

    quotas = QuotaService(database_session)
    owner_id = poi_map.owner_id
    total_before = quotas.usage(owner_id, QuotaKey.PHOTOS_TOTAL_MAX)
    bytes_before = quotas.storage_usage(owner_id)

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Orphelins copiés"})
    assert duplicated.status_code == 201, duplicated.text
    copied_map_id = UUID(duplicated.json()["id"])

    copied_orphan = database_session.scalar(
        select(Photo).where(Photo.map_id == copied_map_id, Photo.place_id.is_(None))
    )
    assert copied_orphan is not None
    assert copied_orphan.id != source_orphan.id
    assert copied_orphan.path != source_orphan.path
    assert_path_identity(copied_orphan.path, copied_orphan.storage_scope_id, copied_orphan.id)

    total_after = quotas.usage(owner_id, QuotaKey.PHOTOS_TOTAL_MAX)
    bytes_after = quotas.storage_usage(owner_id)
    assert total_after == total_before + 1
    assert bytes_after == bytes_before + copied_orphan.file_size_bytes
    assert copied_orphan.file_size_bytes == source_orphan.file_size_bytes

    served = integration_client.get(f"/media/{copied_orphan.id}/download")
    assert served.status_code == 200, served.text
    assert served.content == jpeg_payload("orphelin")

    for orphan_id in (copied_orphan.id, source_orphan.id):
        deleted = integration_client.delete(f"/media/{orphan_id}")
        assert deleted.status_code == 204, deleted.text


def test_soft_deleted_place_photos_are_not_copied_nor_counted(
    integration_client: TestClient,
    photo_storage: Path,
    poi_map,
    database_session,
) -> None:
    from app.photos.storage import get_photo_storage_root

    place_id = create_place(integration_client, str(poi_map.id), "Place corbeille")
    upload = upload_place_photo(integration_client, place_id, "corbeille")

    place_row = database_session.get(Place, UUID(place_id))
    place_row.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()

    duplicated = integration_client.post(f"/maps/{poi_map.id}/duplicate", json={"name": "Corbeille skew"})
    assert duplicated.status_code == 201, duplicated.text
    copied_map_id = duplicated.json()["id"]

    copied_photos = database_session.scalars(
        select(Photo).join(Place, Photo.place_id == Place.id).where(Place.map_id == UUID(copied_map_id))
    ).all()
    assert copied_photos == []

    # The source photo remains untouched; clean it up manually because its
    # place is soft-deleted and therefore unreachable through the API.
    photo_row = database_session.get(Photo, UUID(upload["id"]))
    database_session.delete(photo_row)
    database_session.commit()
    (get_photo_storage_root() / upload["path"]).unlink(missing_ok=True)
