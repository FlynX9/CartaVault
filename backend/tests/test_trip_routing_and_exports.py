import json
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

import pytest

from app.exports import temporary_exports
from app.trips.export_service import create_gpx, create_kmz, google_maps_links
from app.trips.routing.osrm import OsrmRoutingProvider


pytestmark = pytest.mark.unit


class Response:
    status = 200

    def __init__(self, payload): self.payload = payload
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, _limit): return json.dumps(self.payload).encode()


def test_osrm_provider_keeps_routing_on_the_backend(monkeypatch) -> None:
    requested = []
    payload = {"code": "Ok", "routes": [{"geometry": {"type": "LineString", "coordinates": [[2, 48], [3, 49]]}, "distance": 1200, "duration": 300, "legs": [{"distance": 1200, "duration": 300}]}]}
    monkeypatch.setattr("app.trips.routing.osrm.urlopen", lambda request, timeout: requested.append((request.full_url, timeout)) or Response(payload))
    result = OsrmRoutingProvider("https://routing.example.test", timeout=4).calculate_route([(2, 48), (3, 49)])
    assert requested == [("https://routing.example.test/route/v1/driving/2.0000000,48.0000000;3.0000000,49.0000000?overview=full&geometries=geojson&steps=false", 4)]
    assert result.distance_meters == 1200
    assert result.segments == [{"distance_meters": 1200.0, "duration_seconds": 300.0}]


def test_trip_exports_are_valid_files_and_google_links_are_safe(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(temporary_exports, "EXPORT_ROOT", tmp_path)
    first = SimpleNamespace(id=uuid4(), name="Départ", latitude=48.0, longitude=2.0, notes="Note", stop_type="place", visit_status="planned")
    second = SimpleNamespace(id=uuid4(), name="Arrivée", latitude=49.0, longitude=3.0, notes=None, stop_type="place", visit_status="visited")
    day = SimpleNamespace(id=uuid4(), day_number=1, title="Jour 1", previous_night=None, next_night=None, stops=[first, second], route_geometry={"type": "LineString", "coordinates": [[2.0, 48.0], [3.0, 49.0]]})
    trip = SimpleNamespace(id=uuid4(), map_id=uuid4(), name="Voyage été", days=[day])
    user_id = uuid4()

    gpx = create_gpx(trip, user_id)
    kmz = create_kmz(trip, user_id)
    assert gpx.path.suffix == ".gpx" and gpx.path.read_bytes().startswith(b"<?xml")
    assert kmz.path.suffix == ".kmz"
    with ZipFile(kmz.path) as archive:
        assert archive.namelist() == ["doc.kml"]
        assert b"ExtendedData" in archive.read("doc.kml")
    links = google_maps_links(trip)
    assert len(links) == 1
    assert links[0]["url"].startswith("https://www.google.com/maps/dir/?api=1&")
