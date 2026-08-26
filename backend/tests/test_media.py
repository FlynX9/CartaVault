from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from PIL import Image
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo


pytestmark = pytest.mark.integration


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (24, 16), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def test_media_library_is_paginated_and_does_not_expose_storage_paths(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
) -> None:
    place = integration_client.post(
        "/places",
        json={
            "name": f"Media place {uuid4().hex}",
            "map_id": str(poi_map.id),
            "latitude": 48.0,
            "longitude": 2.0,
        },
    )
    assert place.status_code == 201
    uploaded = integration_client.post(
        f"/places/{place.json()['id']}/photos/upload",
        files={"file": ("library.png", png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201
    media_id = uploaded.json()["id"]
    second_upload = integration_client.post(
        f"/places/{place.json()['id']}/photos/upload",
        files={"file": ("secondary.png", png_bytes(), "image/png")},
    )
    assert second_upload.status_code == 201
    second_media_id = second_upload.json()["id"]

    response = integration_client.get("/media?page=1&page_size=1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["pages"] == 2
    assert len(payload["items"]) == 1

    filtered = integration_client.get("/media?q=library&page_size=10")
    assert filtered.status_code == 200
    filtered_item = filtered.json()["items"][0]
    assert filtered.json()["total"] == 1
    assert filtered_item["id"] == media_id
    assert filtered_item["width"] == 24
    assert filtered_item["height"] == 16
    assert filtered_item["file_state"] == "healthy"
    assert "path" not in filtered_item

    thumbnail = integration_client.get(f"/media/{media_id}/thumbnail")
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"].startswith("image/webp")
    changed = integration_client.patch(
        f"/media/{media_id}",
        json={"caption": "Updated caption", "taken_at": "2026-07-23"},
    )
    assert changed.status_code == 200
    assert changed.json()["caption"] == "Updated caption"
    promoted = integration_client.post(f"/media/{second_media_id}/set-main")
    assert promoted.status_code == 200
    assert promoted.json()["is_primary"] is True
    assert integration_client.get(f"/media/{media_id}").json()["is_primary"] is False

    outsider = User(
        email=f"outsider-{uuid4()}@example.test",
        display_name="Outsider admin",
        password_hash="test",
        is_admin=True,
        is_active=True,
    )
    database_session.add(outsider)
    database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: outsider
    assert integration_client.get("/media").json()["total"] == 0
    assert integration_client.get(f"/media/{media_id}").status_code == 404

    viewer = User(
        email=f"viewer-{uuid4()}@example.test",
        display_name="Viewer",
        password_hash="test",
        is_active=True,
    )
    database_session.add(viewer)
    database_session.flush()
    database_session.add(
        MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer")
    )
    database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: viewer
    viewer_item = integration_client.get(f"/media/{media_id}")
    assert viewer_item.status_code == 200
    assert viewer_item.json()["can_edit"] is False
    assert integration_client.patch(
        f"/media/{media_id}",
        json={"caption": "Forbidden"},
    ).status_code == 403

    app.dependency_overrides[get_current_user] = lambda: auth_user
    deleted = integration_client.post(
        "/media/bulk-delete",
        json={"media_ids": [media_id, second_media_id]},
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"selected_count": 2, "deleted_count": 2}


def test_attached_media_keeps_its_original_storage_scope(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    """An orphan media file is stored under its map, not under a later POI id."""
    uploaded = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id), "latitude": "45.764", "longitude": "4.8357"},
        files={"file": ("geotagged.png", png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["can_create_place"] is True
    media_id = uploaded.json()["id"]

    place = integration_client.post(
        "/places",
        json={
            "name": f"Attached media place {uuid4().hex}",
            "map_id": str(poi_map.id),
            "latitude": 45.764,
            "longitude": 4.8357,
        },
    )
    assert place.status_code == 201

    attached = integration_client.post(
        f"/media-actions/{media_id}/attach-place",
        json={"place_id": place.json()["id"]},
    )
    assert attached.status_code == 200
    assert attached.json()["place"]["id"] == place.json()["id"]

    file_response = integration_client.get(f"/photos/{media_id}/file")
    assert file_response.status_code == 200
    assert file_response.headers["content-type"].startswith("image/png")

    deleted = integration_client.delete(f"/photos/{media_id}")
    assert deleted.status_code == 204


def test_unassigned_media_without_gps_can_still_start_manual_place_creation(
    integration_client: TestClient,
    poi_map: PoiMap,
) -> None:
    uploaded = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id)},
        files={"file": ("manual-location.png", png_bytes(), "image/png")},
    )

    assert uploaded.status_code == 201
    assert uploaded.json()["latitude"] is None
    assert uploaded.json()["longitude"] is None
    assert uploaded.json()["can_create_place"] is True

    deleted = integration_client.delete(f"/media/{uploaded.json()['id']}")
    assert deleted.status_code == 204


def test_media_upload_preserves_the_selected_map_context(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
) -> None:
    editor = User(
        email=f"media-editor-{uuid4()}@example.test",
        display_name="Media editor",
        password_hash="test",
        is_active=True,
    )
    database_session.add(editor)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=editor.id, role="editor"))
    database_session.commit()
    app.dependency_overrides[get_current_user] = lambda: editor

    uploaded = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id), "latitude": "45.764", "longitude": "4.8357"},
        files={"file": ("map-scoped.png", png_bytes(), "image/png")},
    )

    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["can_edit"] is True
    assert uploaded.json()["map"]["id"] == str(poi_map.id)
    media_id = UUID(uploaded.json()["id"])
    photo = database_session.get(Photo, media_id)
    assert photo is not None
    assert photo.place_id is None
    assert photo.map_id == poi_map.id
    assert photo.uploaded_by_user_id == editor.id
    assert photo.storage_scope_id == photo.id
    assert integration_client.get(f"/media/{media_id}/download").status_code == 200
    catalogue = integration_client.get("/media", params={"map_id": str(poi_map.id)})
    assert catalogue.status_code == 200
    assert str(media_id) in {item["id"] for item in catalogue.json()["items"]}

    created = integration_client.post(f"/media-actions/{media_id}/create-place")
    assert created.status_code == 200, created.text
    assert created.json()["map"]["id"] == str(poi_map.id)
    assert created.json()["place"] is not None
    database_session.refresh(photo)
    assert photo.place_id is not None
    assert photo.map_id == poi_map.id

    assert integration_client.delete(f"/photos/{media_id}").status_code == 204


def test_media_upload_rejects_invalid_map_context_before_storage(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
    photo_storage,
) -> None:
    viewer = User(
        email=f"media-viewer-{uuid4()}@example.test",
        display_name="Media viewer",
        password_hash="test",
        is_active=True,
    )
    database_session.add(viewer)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"))
    database_session.commit()
    original_photo_count = database_session.query(Photo).count()
    original_files = {path.relative_to(photo_storage) for path in photo_storage.rglob("*") if path.is_file()}

    app.dependency_overrides[get_current_user] = lambda: viewer
    forbidden = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id)},
        files={"file": ("forbidden.png", png_bytes(), "image/png")},
    )
    assert forbidden.status_code == 403

    app.dependency_overrides[get_current_user] = lambda: auth_user
    missing = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(uuid4())},
        files={"file": ("missing.png", png_bytes(), "image/png")},
    )
    assert missing.status_code == 404

    poi_map.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()
    deleted = integration_client.post(
        "/media-actions/upload",
        data={"map_id": str(poi_map.id)},
        files={"file": ("deleted.png", png_bytes(), "image/png")},
    )
    assert deleted.status_code == 404
    assert database_session.query(Photo).count() == original_photo_count
    assert {path.relative_to(photo_storage) for path in photo_storage.rglob("*") if path.is_file()} == original_files
