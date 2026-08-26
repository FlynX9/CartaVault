from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy import update
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.statuses.service import create_default_statuses


pytestmark = pytest.mark.integration


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (24, 16), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def _user(session: Session, name: str) -> User:
    user = User(
        email=f"{name}-{uuid4()}@example.test",
        display_name=name,
        password_hash="test",
        is_active=True,
    )
    session.add(user)
    session.flush()
    return user


def _extra_map(session: Session, owner: User, country_id: UUID, name: str) -> PoiMap:
    poi_map = PoiMap(name=name, country_id=country_id, owner_id=owner.id, is_private=True)
    session.add(poi_map)
    session.flush()
    session.add(MapMembership(map_id=poi_map.id, user_id=owner.id, role="owner"))
    create_default_statuses(session, poi_map.id)
    session.flush()
    return poi_map


def _member(session: Session, poi_map: PoiMap, user: User, role: str) -> None:
    session.add(MapMembership(map_id=poi_map.id, user_id=user.id, role=role))
    session.flush()


def _use(client: TestClient, user: User) -> None:
    del client
    app.dependency_overrides[get_current_user] = lambda: user


def _place_on(client: TestClient, poi_map: PoiMap) -> dict:
    response = client.post(
        "/places",
        json={"name": f"Media ACL {uuid4()}", "map_id": str(poi_map.id), "latitude": 48.0, "longitude": 2.0},
    )
    assert response.status_code == 201
    return response.json()


def _upload(client: TestClient, place_id: str) -> str:
    response = client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": ("acl.png", png_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _catalogue_ids(client: TestClient) -> set[str]:
    return {item["id"] for item in client.get("/media").json()["items"]}


def test_stale_cache_follows_new_map_and_ignores_old_one(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
) -> None:
    """Place moved A -> B while the denormalised cache still says A."""
    target = _extra_map(database_session, auth_user, poi_map.country_id, f"Target {uuid4()}")
    old_editor = _user(database_session, "Old editor A")
    new_editor = _user(database_session, "Editor B")
    _member(database_session, poi_map, old_editor, "editor")
    _member(database_session, target, new_editor, "editor")

    place = _place_on(integration_client, poi_map)
    photo_id = _upload(integration_client, place["id"])

    database_session.execute(update(Place).where(Place.id == place["id"]).values(map_id=target.id))
    database_session.execute(update(Photo).where(Photo.id == photo_id).values(map_id=poi_map.id))
    database_session.commit()

    _use(integration_client, old_editor)
    assert photo_id not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    assert integration_client.get(f"/media/{photo_id}/download").status_code == 404
    assert integration_client.get(f"/media/{photo_id}/thumbnail").status_code == 404
    assert integration_client.patch(f"/media/{photo_id}", json={"caption": "nope"}).status_code == 404
    assert integration_client.post(f"/media/{photo_id}/set-main").status_code == 404
    assert integration_client.delete(f"/media/{photo_id}").status_code == 404
    assert integration_client.post("/media/bulk-delete", json={"media_ids": [photo_id]}).status_code == 404

    _use(integration_client, new_editor)
    assert photo_id in _catalogue_ids(integration_client)
    payload = integration_client.get(f"/media/{photo_id}")
    assert payload.status_code == 200
    assert payload.json()["can_edit"] is True
    assert payload.json()["map"]["id"] == str(target.id)
    assert integration_client.get(f"/media/{photo_id}/thumbnail").status_code == 200
    assert integration_client.get(f"/media/{photo_id}/download").status_code == 200
    assert integration_client.patch(f"/media/{photo_id}", json={"caption": "édité depuis B"}).status_code == 200
    assert integration_client.post(f"/media/{photo_id}/set-main").status_code == 200
    assert integration_client.delete(f"/media/{photo_id}").status_code == 204


def test_inverse_stale_cache_grants_no_rights(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
) -> None:
    other = _extra_map(database_session, auth_user, poi_map.country_id, f"Other {uuid4()}")
    other_editor = _user(database_session, "Editor other")
    _member(database_session, other, other_editor, "editor")

    place = _place_on(integration_client, poi_map)
    photo_id = _upload(integration_client, place["id"])
    database_session.execute(update(Photo).where(Photo.id == photo_id).values(map_id=other.id))
    database_session.commit()

    _use(integration_client, other_editor)
    assert photo_id not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    assert integration_client.patch(f"/media/{photo_id}", json={"caption": "nope"}).status_code == 404
    assert integration_client.delete(f"/media/{photo_id}").status_code == 404

    _use(integration_client, auth_user)
    assert integration_client.get(f"/media/{photo_id}").status_code == 200
    assert integration_client.delete(f"/media/{photo_id}").status_code == 204


def test_attached_photo_without_cache_follows_place_map(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
) -> None:
    editor = _user(database_session, "Import editor")
    _member(database_session, poi_map, editor, "editor")

    place = _place_on(integration_client, poi_map)
    photo_id = _upload(integration_client, place["id"])
    database_session.execute(update(Photo).where(Photo.id == photo_id).values(map_id=None))
    database_session.commit()

    _use(integration_client, editor)
    assert photo_id in _catalogue_ids(integration_client)
    payload = integration_client.get(f"/media/{photo_id}")
    assert payload.status_code == 200
    assert payload.json()["can_edit"] is True

    stranger = _user(database_session, "Stranger")
    _use(integration_client, stranger)
    assert photo_id not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    _use(integration_client, auth_user)
    assert integration_client.delete(f"/media/{photo_id}").status_code == 204


def test_attached_uploader_keeps_no_special_rights(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
) -> None:
    uploader = _user(database_session, "Detached uploader")
    place = _place_on(integration_client, poi_map)
    photo = Photo(
        place_id=place["id"],
        map_id=None,
        filename="imported.png",
        original_name="imported.png",
        mime_type="image/png",
        storage_scope_id=uuid4(),
        uploaded_by_user_id=uploader.id,
        sort_order=1,
    )
    database_session.add(photo)
    database_session.commit()

    _use(integration_client, uploader)
    assert str(photo.id) not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo.id}").status_code == 404


def test_unattached_map_scoped_orphan_keeps_map_authority(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
) -> None:
    uploader = _user(database_session, "Orphan uploader")
    viewer = _user(database_session, "Map viewer")
    _member(database_session, poi_map, viewer, "viewer")
    photo = Photo(
        place_id=None,
        map_id=poi_map.id,
        filename="scoped.png",
        storage_scope_id=uuid4(),
        uploaded_by_user_id=uploader.id,
        sort_order=0,
    )
    database_session.add(photo)
    database_session.commit()

    _use(integration_client, viewer)
    assert str(photo.id) in _catalogue_ids(integration_client)
    payload = integration_client.get(f"/media/{photo.id}")
    assert payload.status_code == 200
    assert payload.json()["can_edit"] is False

    _use(integration_client, uploader)
    assert str(photo.id) not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo.id}").status_code == 404


def test_unattached_global_orphan_remains_uploader_only(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
) -> None:
    colleague = _user(database_session, "Colleague editor")
    _member(database_session, poi_map, colleague, "editor")

    _use(integration_client, auth_user)
    uploaded = integration_client.post(
        "/media-actions/upload",
        files={"file": ("orphan.png", png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    photo_id = uploaded.json()["id"]
    assert uploaded.json()["can_edit"] is True
    assert uploaded.json()["can_create_place"] is True
    assert photo_id in _catalogue_ids(integration_client)

    _use(integration_client, colleague)
    assert photo_id not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    _use(integration_client, auth_user)
    assert integration_client.delete(f"/media/{photo_id}").status_code == 204


def test_trashed_map_media_is_hidden(
    integration_client: TestClient,
    database_session: Session,
    poi_map: PoiMap,
    auth_user: User,
    photo_storage,
) -> None:
    place = _place_on(integration_client, poi_map)
    photo_id = _upload(integration_client, place["id"])

    database_session.execute(
        update(PoiMap)
        .where(PoiMap.id == poi_map.id)
        .values(deleted_at=datetime.now(UTC).replace(tzinfo=None))
    )
    database_session.commit()

    _use(integration_client, auth_user)
    assert photo_id not in _catalogue_ids(integration_client)
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    for path in photo_storage.rglob("*"):
        if path.is_file():
            path.unlink()
