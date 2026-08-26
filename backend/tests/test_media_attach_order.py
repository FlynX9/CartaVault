"""AUD-019: attaching an orphan media must never collide on UNIQUE(place_id, sort_order)."""

from io import BytesIO
from uuid import UUID, uuid4

import pytest
import sqlalchemy
from starlette.testclient import TestClient

from app.main import app
from app.auth.dependencies import get_current_user
from app.photos.models import Photo


pytestmark = pytest.mark.integration


def png_bytes() -> bytes:
    from PIL import Image

    output = BytesIO()
    Image.new("RGB", (24, 16), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def metadata_photo(database_session, poi_map, place_id, sort_order: int, is_primary: bool) -> Photo:
    """Insert a metadata-only photo without touching any physical blob."""

    photo = Photo(
        place_id=place_id,
        map_id=poi_map.id,
        filename=f"existing-{sort_order}.jpg",
        original_name=f"existing-{sort_order}.jpg",
        mime_type="image/jpeg",
        file_size_bytes=64,
        width=8,
        height=8,
        sort_order=sort_order,
        is_primary=is_primary,
    )
    database_session.add(photo)
    database_session.flush()
    return photo


def create_place(client: TestClient, poi_map) -> str:
    response = client.post(
        "/places",
        json={"name": f"Attach order {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload_orphan(client: TestClient, poi_map) -> dict:
    response = client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id)},
        files={"file": ("orphan.png", png_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def attach(client: TestClient, media_id: str, place_id: str):
    return client.post(f"/media-actions/{media_id}/attach-place", json={"place_id": place_id})


def place_photos(database_session, place_id) -> list[Photo]:
    return (
        database_session.query(Photo)
        .filter(Photo.place_id == place_id)
        .order_by(Photo.sort_order)
        .all()
    )


def test_attach_to_empty_place_takes_order_zero_and_becomes_primary(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    place_id = create_place(integration_client, poi_map)
    orphan = upload_orphan(integration_client, poi_map)

    attached = attach(integration_client, orphan["id"], place_id)
    assert attached.status_code == 200, attached.text

    photos = place_photos(database_session, place_id)
    assert len(photos) == 1
    assert photos[0].id == UUID(orphan["id"])
    assert photos[0].sort_order == 0
    assert photos[0].is_primary is True
    assert photos[0].map_id == poi_map.id

    assert integration_client.delete(f"/media/{orphan['id']}").status_code == 204


def test_attach_to_place_with_primary_appends_without_collision(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    place_id = create_place(integration_client, poi_map)
    existing = metadata_photo(database_session, poi_map, place_id, sort_order=0, is_primary=True)

    orphan = upload_orphan(integration_client, poi_map)
    # The orphan itself carries the legacy sort_order=0 that used to collide.
    assert database_session.get(Photo, UUID(orphan["id"])).sort_order == 0

    attached = attach(integration_client, orphan["id"], place_id)
    assert attached.status_code == 200, attached.text

    photos = place_photos(database_session, place_id)
    assert [(photo.sort_order, photo.is_primary) for photo in photos] == [
        (0, True),
        (1, False),
    ]
    assert photos[0].id == existing.id
    assert photos[1].id == UUID(orphan["id"])
    assert photos[1].map_id == poi_map.id

    assert integration_client.delete(f"/media/{orphan['id']}").status_code == 204


def test_attach_to_place_with_several_photos_appends_at_the_end(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    place_id = create_place(integration_client, poi_map)
    metadata_photo(database_session, poi_map, place_id, sort_order=0, is_primary=True)
    metadata_photo(database_session, poi_map, place_id, sort_order=1, is_primary=False)
    metadata_photo(database_session, poi_map, place_id, sort_order=2, is_primary=False)

    first_orphan = upload_orphan(integration_client, poi_map)
    second_orphan = upload_orphan(integration_client, poi_map)
    assert attach(integration_client, first_orphan["id"], place_id).status_code == 200
    assert attach(integration_client, second_orphan["id"], place_id).status_code == 200

    orders = [photo.sort_order for photo in place_photos(database_session, place_id)]
    assert orders == [0, 1, 2, 3, 4]
    assert len(set(orders)) == len(orders)

    assert integration_client.delete(f"/media/{first_orphan['id']}").status_code == 204
    assert integration_client.delete(f"/media/{second_orphan['id']}").status_code == 204


def test_attach_failure_before_commit_leaves_the_orphan_untouched(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.media.router as media_router
    from app.photos.storage import get_photo_storage_root

    place_id = create_place(integration_client, poi_map)
    orphan = upload_orphan(integration_client, poi_map)
    original_history = media_router.add_place_history

    def failing_history(*args, **kwargs):
        raise sqlalchemy.exc.SQLAlchemyError("injected failure")

    # Never call monkeypatch.undo() here: the instance is shared with the
    # photo_storage fixture, and undo() would also drop PHOTO_STORAGE_PATH.
    monkeypatch.setattr(media_router, "add_place_history", failing_history)
    attached = attach(integration_client, orphan["id"], place_id)
    assert attached.status_code == 500

    photo = database_session.get(Photo, UUID(orphan["id"]))
    database_session.refresh(photo)
    assert photo.place_id is None
    assert photo.map_id == poi_map.id
    assert photo.sort_order == 0
    assert place_photos(database_session, place_id) == []

    monkeypatch.setattr(media_router, "add_place_history", original_history)
    retry = attach(integration_client, orphan["id"], place_id)
    assert retry.status_code == 200
    retried = place_photos(database_session, place_id)
    assert [(item.sort_order, item.is_primary) for item in retried] == [(0, True)]

    storage_root = get_photo_storage_root()
    blobs = [item for item in storage_root.rglob("*") if item.is_file()]
    assert len(blobs) == 1
    deleted = integration_client.delete(f"/media/{orphan['id']}")
    assert deleted.status_code == 204
    assert not blobs[0].exists()
