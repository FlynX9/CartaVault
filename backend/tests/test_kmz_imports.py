from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from starlette.testclient import TestClient

from app.maps.models import PoiMap


pytestmark = pytest.mark.integration


def kmz_payload() -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", b"<kml><Placemark><name>Point importe</name><ExtendedData><Data name='Architecte'><value>Jane Doe</value></Data></ExtendedData><Point><coordinates>2.35,48.85</coordinates></Point></Placemark></kml>")
    return output.getvalue()


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
