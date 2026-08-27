from __future__ import annotations

from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.main import app
from app.maps.models import MapMembership


pytestmark = pytest.mark.integration


def _kml(client, map_id) -> tuple[str, set[str]]:
    created = client.post(f"/maps/{map_id}/exports/kmz", json={})
    assert created.status_code == 201, created.text
    downloaded = client.get(created.json()["download_url"])
    assert downloaded.status_code == 200
    with ZipFile(BytesIO(downloaded.content)) as archive:
        return archive.read("doc.kml").decode(), set(archive.namelist())


def test_kmz_excludes_soft_deleted_places_and_media_for_owner_and_viewer(
    integration_client,
    database_session,
    poi_map,
    auth_user,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.exports.temporary_exports.EXPORT_ROOT", tmp_path / "exports")
    active = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "Active export", "latitude": 48, "longitude": 2},
    ).json()
    deleted = integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "Deleted export", "latitude": 49, "longitude": 3},
    ).json()
    media = integration_client.post(
        f"/places/{deleted['id']}/photos/upload",
        files={"file": ("private.jpg", b"\xff\xd8\xff\xe0private\xff\xd9", "image/jpeg")},
    ).json()

    before, before_files = _kml(integration_client, poi_map.id)
    assert "Active export" in before and "Deleted export" in before
    assert any(media["id"] in name for name in before_files)

    assert integration_client.delete(f"/places/{deleted['id']}").status_code == 204
    owner_kml, owner_files = _kml(integration_client, poi_map.id)
    assert "Active export" in owner_kml
    assert "Deleted export" not in owner_kml
    assert not any(media["id"] in name for name in owner_files)

    viewer = User(
        email=f"viewer-export-{uuid4()}@example.test",
        display_name="Export viewer",
        password_hash="test-only",
        is_active=True,
    )
    database_session.add(viewer)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"))
    database_session.commit()
    app.dependency_overrides[get_current_user] = lambda: viewer
    viewer_kml, viewer_files = _kml(integration_client, poi_map.id)
    assert "Active export" in viewer_kml
    assert "Deleted export" not in viewer_kml
    assert not any(media["id"] in name for name in viewer_files)

    app.dependency_overrides[get_current_user] = lambda: auth_user
    assert integration_client.post(f"/trash/place/{deleted['id']}/restore").status_code == 204
    restored_kml, restored_files = _kml(integration_client, poi_map.id)
    assert "Deleted export" in restored_kml
    assert any(media["id"] in name for name in restored_files)

    assert integration_client.delete(f"/photos/{media['id']}").status_code == 204
    assert integration_client.delete(f"/places/{active['id']}").status_code == 204
    assert integration_client.delete(f"/trash/place/{active['id']}").status_code == 204


def test_soft_deleted_map_and_trip_are_not_exportable(
    integration_client,
    poi_map,
) -> None:
    integration_client.post(
        "/places",
        json={"map_id": str(poi_map.id), "name": "Export guard", "latitude": 48, "longitude": 2},
    )
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Deleted trip export"}).json()
    assert integration_client.delete(f"/trips/{trip['id']}").status_code == 204
    assert integration_client.post(f"/trips/{trip['id']}/exports/kmz").status_code == 404

    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    assert integration_client.post(f"/maps/{poi_map.id}/exports/kmz", json={}).status_code == 404
