import json
from datetime import date, time
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

import pytest
from PIL import Image as PillowImage

from app.exports import temporary_exports
from app.trips.export_service import create_gpx, create_kmz, google_maps_links
from app.trips.pdf_export import create_pdf
from app.trips import pdf_export
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


def test_trip_pdf_export_builds_an_a4_unicode_booklet(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(temporary_exports, "EXPORT_ROOT", tmp_path)
    stop = SimpleNamespace(
        id=uuid4(), place_id=None, name="Musée 日本", latitude=48.8566, longitude=2.3522,
        planned_arrival=time(10, 0), visit_duration_minutes=60, address="Paris", notes=None,
        sort_order=0, is_required=True, visit_status="planned",
    )
    day = SimpleNamespace(
        id=uuid4(), day_number=1, title="Découverte", date=date(2026, 8, 1), color="#0FA68A",
        notes="Programme détaillé", stops=[stop], sort_order=0,
        route_geometry={"type": "LineString", "coordinates": [[2.34, 48.85], [2.36, 48.86]]},
        route_status="ready", route_distance_meters=3200.0, route_duration_seconds=900.0,
        route_segments=[], route_provider="osrm", max_total_duration_minutes=None,
        default_stop_buffer_minutes=10, safety_margin_type="fixed", safety_margin_value=15,
        target_arrival_time=time(18, 0), trip=None,
    )
    trip = SimpleNamespace(
        id=uuid4(), map_id=uuid4(), created_by_user_id=uuid4(), name="Été à Paris 日本",
        description="Carnet international", start_date=date(2026, 8, 1), end_date=date(2026, 8, 1),
        days=[day], nights=[], departure=None, arrival=None,
        map=SimpleNamespace(country=SimpleNamespace(iso_alpha3="FRA")),
        low_load_max_minutes=240, medium_load_max_minutes=480,
        low_load_color="#0FA68A", medium_load_color="#D97706", high_load_color="#DC2626",
    )
    day.trip = trip

    exported = create_pdf(None, trip, uuid4(), "fr")

    assert exported.file_name == "ete-a-paris.pdf"
    assert exported.path.suffix == ".pdf"
    assert exported.path.read_bytes().startswith(b"%PDF-1.4")
    assert exported.path.stat().st_size > 20_000


def test_pdf_basemap_composes_and_reuses_cached_tiles(tmp_path, monkeypatch) -> None:
    tile_buffer = BytesIO()
    PillowImage.new("RGB", (256, 256), "#D9E7DD").save(tile_buffer, format="PNG")
    tile_bytes = tile_buffer.getvalue()
    requests = []
    monkeypatch.setenv("CARTAVAULT_PDF_MAP_TILES_ENABLED", "true")
    monkeypatch.setenv("CARTAVAULT_PDF_MAP_TILE_CACHE", str(tmp_path))
    monkeypatch.setattr(pdf_export, "_map_tile_bytes", lambda zoom, x, y: requests.append((zoom, x, y)) or tile_bytes)

    first = pdf_export._basemap_background((2.20, 2.45, 48.80, 48.95), 510, 312)

    assert isinstance(first, Path)
    assert first.is_file()
    assert requests
    monkeypatch.setattr(pdf_export, "_map_tile_bytes", lambda *_args: pytest.fail("render cache was not reused"))
    assert pdf_export._basemap_background((2.20, 2.45, 48.80, 48.95), 510, 312) == first
