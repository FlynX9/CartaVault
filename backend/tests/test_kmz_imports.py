from io import BytesIO
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.models import User
from app.maps.models import PoiMap
from app.imports.remote_images import RemoteImageError
from app.imports.service import confirm_import, get_cached_import


pytestmark = pytest.mark.integration


def kmz_payload() -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", b"<kml><Placemark><name>Point importe</name><ExtendedData><Data name='Architecte'><value>Jane Doe</value></Data></ExtendedData><Point><coordinates>2.35,48.85</coordinates></Point></Placemark></kml>")
    return output.getvalue()


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
