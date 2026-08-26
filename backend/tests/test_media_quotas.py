"""AUD-017: every media row must be charged to exactly one quota owner."""

from io import BytesIO
from uuid import UUID, uuid4

import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership
from app.photos.models import Photo
from app.quotas.models import QuotaProfile
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


pytestmark = pytest.mark.integration


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (24, 16), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def jpeg_bytes(tag: str) -> bytes:
    output = BytesIO()
    tint = sum(tag.encode()) % 200 + 20
    Image.new("RGB", (8, 6), color=(tint, 40, 90)).save(output, format="JPEG")
    return output.getvalue()


def add_member(database_session, poi_map_id, user_id: UUID, role: str) -> None:
    database_session.add(MapMembership(map_id=poi_map_id, user_id=user_id, role=role))
    database_session.flush()


def new_user(database_session, name: str) -> User:
    user = User(
        email=f"{name}-{uuid4()}@example.test",
        display_name=name,
        password_hash="test",
        is_active=True,
    )
    database_session.add(user)
    database_session.flush()
    return user


def set_quota_limits(database_session, user: User, **limits) -> None:
    profile = QuotaProfile(name=f"limited-{uuid4()}", description="AUD-017", is_active=True, **limits)
    database_session.add(profile)
    database_session.flush()
    user.quota_profile_id = profile.id
    database_session.flush()


def media_totals(database_session, owner_id: UUID) -> tuple[int, int]:
    service = QuotaService(database_session)
    return (
        service.usage(owner_id, QuotaKey.PHOTOS_TOTAL_MAX),
        service.storage_usage(owner_id),
    )


def upload_media(client: TestClient, *, map_id=None, file_name="orphan.png", payload=None):
    data = {"map_id": str(map_id)} if map_id is not None else {}
    return client.post(
        "/media-actions/upload",
        data=data,
        files={"file": (file_name, payload or png_bytes(), "image/png")},
    )


def discard_media(client: TestClient, media_ids) -> None:
    for media_id in media_ids:
        response = client.delete(f"/media/{media_id}")
        assert response.status_code == 204, response.text


def test_map_scoped_orphan_is_charged_to_the_map_owner(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    editor = new_user(database_session, "Quota editor")
    add_member(database_session, poi_map.id, editor.id, "editor")
    set_quota_limits(database_session, auth_user, photos_total_max=1)
    app.dependency_overrides[get_current_user] = lambda: editor

    first = upload_media(integration_client, map_id=poi_map.id)
    assert first.status_code == 201, first.text
    photo = database_session.get(Photo, UUID(first.json()["id"]))
    assert photo is not None
    # AUD-018 non-regression: the chosen map and the storage identity stay intact.
    assert photo.place_id is None
    assert photo.map_id == poi_map.id
    assert photo.storage_scope_id == photo.id
    assert photo.file_size_bytes and photo.file_size_bytes > 0

    assert media_totals(database_session, auth_user.id) == (1, photo.file_size_bytes)
    assert media_totals(database_session, editor.id) == (0, 0)

    second = upload_media(integration_client, map_id=poi_map.id)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "quota.photos_total.limit_reached"
    assert media_totals(database_session, auth_user.id) == (1, photo.file_size_bytes)

    discard_media(integration_client, [str(photo.id)])


def test_global_orphan_is_charged_to_its_uploader(
    integration_client: TestClient,
    database_session,
    auth_user: User,
) -> None:
    set_quota_limits(database_session, auth_user, photos_total_max=1)

    first = upload_media(integration_client)
    assert first.status_code == 201, first.text
    photo = database_session.get(Photo, UUID(first.json()["id"]))
    assert photo.map_id is None
    assert photo.uploaded_by_user_id == auth_user.id
    assert media_totals(database_session, auth_user.id) == (1, photo.file_size_bytes)

    second = upload_media(integration_client)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "quota.photos_total.limit_reached"

    discard_media(integration_client, [str(photo.id)])
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_attached_photo_is_counted_exactly_once(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    uploaded = upload_media(integration_client, map_id=poi_map.id)
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    size = database_session.get(Photo, UUID(media_id)).file_size_bytes

    place = integration_client.post(
        "/places",
        json={"name": f"Counted once {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert place.status_code == 201
    place_id = place.json()["id"]

    attached = integration_client.post(
        f"/media-actions/{media_id}/attach-place",
        json={"place_id": place_id},
    )
    assert attached.status_code == 200, attached.text
    assert media_totals(database_session, auth_user.id) == (1, size)

    metadata_only = integration_client.post(
        f"/places/{place_id}/photos",
        json={"filename": "metadata-only.jpg", "original_name": "metadata-only.jpg"},
    )
    assert metadata_only.status_code == 201, metadata_only.text
    photos_total, storage_bytes = media_totals(database_session, auth_user.id)
    assert photos_total == 2
    assert storage_bytes == size

    discard_media(integration_client, [str(UUID(metadata_only.json()["id"])), media_id])
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_attach_to_same_owner_adds_no_extra_charge(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    editor = new_user(database_session, "Same owner editor")
    add_member(database_session, poi_map.id, editor.id, "editor")

    uploaded = upload_media(integration_client, map_id=poi_map.id)
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    size = database_session.get(Photo, UUID(media_id)).file_size_bytes
    assert media_totals(database_session, auth_user.id) == (1, size)

    place = integration_client.post(
        "/places",
        json={"name": f"Same owner {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert place.status_code == 201

    app.dependency_overrides[get_current_user] = lambda: editor
    attached = integration_client.post(
        f"/media-actions/{media_id}/attach-place",
        json={"place_id": place.json()["id"]},
    )
    assert attached.status_code == 200, attached.text

    assert media_totals(database_session, auth_user.id) == (1, size)
    assert media_totals(database_session, editor.id) == (0, 0)

    discard_media(integration_client, [media_id])


def test_attach_owner_change_transfers_the_charge(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    uploader = new_user(database_session, "Global uploader")
    add_member(database_session, poi_map.id, uploader.id, "editor")

    app.dependency_overrides[get_current_user] = lambda: uploader
    uploaded = upload_media(integration_client)
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    size = database_session.get(Photo, UUID(media_id)).file_size_bytes
    assert media_totals(database_session, uploader.id) == (1, size)
    assert media_totals(database_session, auth_user.id) == (0, 0)

    place = integration_client.post(
        "/places",
        json={"name": f"Owner change {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert place.status_code == 201

    attached = integration_client.post(
        f"/media-actions/{media_id}/attach-place",
        json={"place_id": place.json()["id"]},
    )
    assert attached.status_code == 200, attached.text
    assert media_totals(database_session, uploader.id) == (0, 0)
    assert media_totals(database_session, auth_user.id) == (1, size)

    discard_media(integration_client, [media_id])
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_attach_owner_change_is_refused_when_the_target_is_saturated(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    uploader = new_user(database_session, "Saturated uploader")
    add_member(database_session, poi_map.id, uploader.id, "editor")
    set_quota_limits(database_session, auth_user, photos_total_max=0)

    app.dependency_overrides[get_current_user] = lambda: uploader
    uploaded = upload_media(integration_client)
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]

    place = integration_client.post(
        "/places",
        json={"name": f"Saturated {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert place.status_code == 201

    refused = integration_client.post(
        f"/media-actions/{media_id}/attach-place",
        json={"place_id": place.json()["id"]},
    )
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "quota.photos_total.limit_reached"

    photo = database_session.get(Photo, UUID(media_id))
    database_session.refresh(photo)
    assert photo.place_id is None
    assert photo.map_id is None
    assert photo.uploaded_by_user_id == uploader.id
    assert media_totals(database_session, uploader.id) == (1, photo.file_size_bytes)
    assert media_totals(database_session, auth_user.id) == (0, 0)

    discard_media(integration_client, [media_id])


def test_storage_refusal_keeps_the_409_contract_and_cleans_the_blob(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
    photo_storage,
) -> None:
    set_quota_limits(database_session, auth_user, photos_total_max=5, storage_bytes_max=10)
    photos_before = database_session.query(Photo).count()

    refused = upload_media(integration_client, map_id=poi_map.id)
    assert refused.status_code == 409, refused.text
    detail = refused.json()["detail"]
    assert detail["code"] == "quota.storage_bytes.limit_reached"
    assert detail["params"]["limit"] == 10
    assert database_session.query(Photo).count() == photos_before
    assert list(photo_storage.rglob("*")) == []
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_trip_night_photos_stay_charged_to_the_map_owner(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Quota nuits AUD-017"}).json()
    second_day = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": trip["days"][0]["id"],
            "next_day_id": second_day["id"],
            "name": "Nuit comptée",
            "latitude": 48.4,
            "longitude": 2.3,
        },
    ).json()
    assert media_totals(database_session, auth_user.id) == (0, 0)

    payload = jpeg_bytes("nuit-aud-017")
    uploaded = integration_client.post(
        f"/trip-nights/{night['id']}/photos",
        files={"file": ("nuit.jpg", payload, "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text
    assert media_totals(database_session, auth_user.id) == (1, len(payload))

    removed = integration_client.delete(f"/trip-nights/{night['id']}/photos/{uploaded.json()['photo_id']}")
    assert removed.status_code == 200
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_geotagged_orphan_create_place_keeps_media_totals_stable(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    uploaded = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id), "latitude": "45.764", "longitude": "4.8357"},
        files={"file": ("geotagged-quota.png", png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    media_id = uploaded.json()["id"]
    size = database_session.get(Photo, UUID(media_id)).file_size_bytes
    before = media_totals(database_session, auth_user.id)
    assert before == (1, size)

    created = integration_client.post(f"/media-actions/{media_id}/create-place")
    assert created.status_code == 200, created.text
    assert media_totals(database_session, auth_user.id) == before

    discard_media(integration_client, [media_id])
    assert media_totals(database_session, auth_user.id) == (0, 0)


def test_historical_orphans_are_counted_without_migration(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    editor = new_user(database_session, "Historic uploader")

    historic_map_orphan = Photo(
        place_id=None,
        map_id=poi_map.id,
        filename="historic-map-orphan.png",
        mime_type="image/png",
        file_size_bytes=12345,
        uploaded_by_user_id=editor.id,
        sort_order=0,
        is_primary=False,
    )
    historic_global_orphan = Photo(
        place_id=None,
        map_id=None,
        filename="historic-global-orphan.png",
        mime_type="image/png",
        file_size_bytes=777,
        uploaded_by_user_id=auth_user.id,
        sort_order=0,
        is_primary=False,
    )
    database_session.add_all([historic_map_orphan, historic_global_orphan])
    database_session.flush()

    assert media_totals(database_session, auth_user.id) == (2, 12345 + 777)
    assert media_totals(database_session, editor.id) == (0, 0)

    database_session.delete(historic_global_orphan)
    assert media_totals(database_session, auth_user.id) == (1, 12345)
    database_session.delete(historic_map_orphan)
    database_session.flush()
    assert media_totals(database_session, auth_user.id) == (0, 0)
