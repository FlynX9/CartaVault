from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership, PoiMap


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
