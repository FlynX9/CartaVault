from __future__ import annotations

from io import BytesIO
from uuid import uuid4
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pytest
from sqlalchemy import event


pytestmark = pytest.mark.integration


def test_kmz_export_batches_coordinates_and_primary_categories(
    integration_client,
    database_session,
    poi_map,
    tmp_path,
    monkeypatch,
) -> None:
    export_root = tmp_path / "exports"
    monkeypatch.setattr("app.exports.temporary_exports.EXPORT_ROOT", export_root)
    category_name = f"Export primary {uuid4().hex}"
    category = integration_client.post(
        "/categories",
        json={"map_id": str(poi_map.id), "name": category_name, "icon": "mdi:church"},
    )
    assert category.status_code == 201, category.text

    expected_coordinates: dict[str, tuple[float, float]] = {}
    for index in range(3):
        name = f"Batched KMZ {index} {uuid4().hex}"
        longitude = 2.11 + index / 100
        latitude = 47.21 + index / 100
        place = integration_client.post(
            "/places",
            json={
                "map_id": str(poi_map.id),
                "name": name,
                "longitude": longitude,
                "latitude": latitude,
            },
        )
        assert place.status_code == 201, place.text
        assigned = integration_client.post(
            f"/places/{place.json()['id']}/categories/{category.json()['id']}",
        )
        assert assigned.status_code == 200, assigned.text
        expected_coordinates[name] = (longitude, latitude)

    statements: list[str] = []

    def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(" ".join(statement.lower().split()))

    event.listen(database_session.bind, "before_cursor_execute", record_statement)
    try:
        created = integration_client.post(
            f"/maps/{poi_map.id}/exports/kmz",
            json={"include_images": False},
        )
    finally:
        event.remove(database_session.bind, "before_cursor_execute", record_statement)

    assert created.status_code == 201, created.text
    assert len(list(export_root.glob("*.kmz"))) == 1
    downloaded = integration_client.get(created.json()["download_url"])
    assert downloaded.status_code == 200, downloaded.text
    with ZipFile(BytesIO(downloaded.content)) as archive:
        root = ET.fromstring(archive.read("doc.kml"))

    namespace = {"kml": "http://www.opengis.net/kml/2.2"}
    placemarks = root.findall(".//kml:Placemark", namespace)
    assert len(placemarks) == len(expected_coordinates)
    for placemark in placemarks:
        name = placemark.findtext("kml:name", namespaces=namespace)
        coordinates = placemark.findtext("kml:Point/kml:coordinates", namespaces=namespace)
        assert name in expected_coordinates
        assert coordinates is not None
        longitude, latitude, altitude = (float(value) for value in coordinates.split(","))
        assert (longitude, latitude) == pytest.approx(expected_coordinates[name])
        assert altitude == 0
        extended_data = {
            item.attrib["name"]: item.findtext("kml:value", namespaces=namespace)
            for item in placemark.findall("kml:ExtendedData/kml:Data", namespace)
        }
        assert extended_data["cartavault:primary_category"] == category_name

    coordinate_queries = [
        statement
        for statement in statements
        if statement.startswith("select ") and "st_x(" in statement and "st_y(" in statement
    ]
    primary_category_queries = [
        statement
        for statement in statements
        if statement.startswith("select ") and "place_categories" in statement and "is_primary" in statement
    ]
    assert len(coordinate_queries) == 1
    assert primary_category_queries == coordinate_queries
    assert "left outer join place_categories" in coordinate_queries[0]
    assert "left outer join categories" in coordinate_queries[0]
