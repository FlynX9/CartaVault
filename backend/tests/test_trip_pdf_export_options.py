from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from PIL import Image
from pydantic import ValidationError
from reportlab.graphics.shapes import String

from app.trips import pdf_export
from app.trips.navigation_links import InvalidNavigationCoordinates, NavigationProvider, build_navigation_url
from app.trips.schemas import TripPdfExportOptions


pytestmark = pytest.mark.unit


def test_navigation_links_are_local_stable_and_provider_specific() -> None:
    assert build_navigation_url(NavigationProvider.GOOGLE_MAPS, 48.8566, 2.3522) == (
        "https://www.google.com/maps/search/?api=1&query=48.8566,2.3522"
    )
    assert build_navigation_url(NavigationProvider.WAZE, 48.8566, 2.3522) == (
        "https://waze.com/ul?ll=48.8566,2.3522&navigate=yes"
    )
    with pytest.raises(InvalidNavigationCoordinates):
        build_navigation_url(NavigationProvider.GOOGLE_MAPS, 91, 2)


def test_export_options_reject_unknown_provider_and_fields() -> None:
    defaults = TripPdfExportOptions()
    assert defaults.navigation_providers == [NavigationProvider.GOOGLE_MAPS]
    assert defaults.include_overview_map and defaults.include_place_images and defaults.include_navigation_qr_codes
    with pytest.raises(ValidationError):
        TripPdfExportOptions(navigation_providers=["citymapper"])  # type: ignore[list-item]
    with pytest.raises(ValidationError):
        TripPdfExportOptions.model_validate({"unknown_option": True})
    with pytest.raises(ValidationError):
        TripPdfExportOptions(navigation_providers=[])
    assert TripPdfExportOptions(navigation_providers=[NavigationProvider.WAZE, NavigationProvider.GOOGLE_MAPS]).navigation_providers == [
        NavigationProvider.GOOGLE_MAPS,
        NavigationProvider.WAZE,
    ]


def test_qr_uses_high_error_correction_and_embeds_a_provider_pictogram(monkeypatch) -> None:
    captured: dict[str, object] = {}
    real_qr = pdf_export.qrcode.QRCode

    def recording_qr(*args, **kwargs):
        captured.update(kwargs)
        return real_qr(*args, **kwargs)

    monkeypatch.setattr(pdf_export.qrcode, "QRCode", recording_qr)
    image = pdf_export._qr_image("https://waze.com/ul?ll=48.8566,2.3522&navigate=yes", NavigationProvider.WAZE)

    assert captured["error_correction"] == pdf_export.qrcode.constants.ERROR_CORRECT_H
    assert isinstance(image, Image.Image)
    center = image.width // 2
    assert image.getpixel((center, center)) != (255, 255, 255)


def test_disabled_photos_do_not_execute_the_photo_query() -> None:
    place_id = uuid4()
    stop = SimpleNamespace(place_id=place_id)
    trip = SimpleNamespace(days=[SimpleNamespace(stops=[stop])])
    statements: list[object] = []

    class ScalarResult:
        def all(self):
            return []

    class Session:
        def scalars(self, statement):
            statements.append(statement)
            return ScalarResult()

    photos, links = pdf_export._place_assets(Session(), trip, include_photos=False)  # type: ignore[arg-type]

    assert photos == {} and links == {}
    assert len(statements) == 1
    assert "place_links" in str(statements[0]).lower()


@pytest.mark.parametrize(
    ("images", "qr_codes", "expected_columns"),
    [(True, True, 4), (True, False, 3), (False, True, 3), (False, False, 2)],
)
def test_stop_card_columns_follow_enabled_content(images, qr_codes, expected_columns, monkeypatch) -> None:
    monkeypatch.setattr(pdf_export, "_photo", lambda *_args: "photo")
    monkeypatch.setattr(pdf_export, "_navigation_block", lambda *_args: ["qr"])
    stop = SimpleNamespace(name="Musée", latitude=48.8566, longitude=2.3522, address="Paris", planned_arrival=None, visit_duration_minutes=30)
    options = TripPdfExportOptions(include_place_images=images, include_navigation_qr_codes=qr_codes)

    card = pdf_export._stop_timeline_card("1", stop, [], None, "fr", pdf_export._styles("Helvetica", "Helvetica-Bold"), "#0FA68A", None, options)

    assert len(card._colWidths) == expected_columns


def test_stop_card_can_render_google_maps_and_waze_together(monkeypatch) -> None:
    rendered: list[NavigationProvider] = []
    monkeypatch.setattr(pdf_export, "_navigation_block", lambda _stop, provider, *_args: rendered.append(provider) or [provider.value])
    stop = SimpleNamespace(name="Musée", latitude=48.8566, longitude=2.3522, address="Paris", planned_arrival=None, visit_duration_minutes=30)
    options = TripPdfExportOptions(include_place_images=False, navigation_providers=[NavigationProvider.GOOGLE_MAPS, NavigationProvider.WAZE])

    card = pdf_export._stop_timeline_card("1", stop, [], None, "fr", pdf_export._styles("Helvetica", "Helvetica-Bold"), "#0FA68A", None, options)

    assert rendered == [NavigationProvider.GOOGLE_MAPS, NavigationProvider.WAZE]
    assert len(card._colWidths) == 3


def test_navigation_failure_is_isolated(monkeypatch) -> None:
    monkeypatch.setattr(pdf_export, "_qr", lambda *_args: (_ for _ in ()).throw(RuntimeError("QR unavailable")))
    stop = SimpleNamespace(latitude=48.8566, longitude=2.3522)

    block = pdf_export._navigation_block(stop, NavigationProvider.GOOGLE_MAPS, "fr", pdf_export._styles("Helvetica", "Helvetica-Bold"))

    assert "Navigation indisponible" in block[0].text


def test_map_points_ignore_missing_and_invalid_coordinates() -> None:
    trip = SimpleNamespace(
        departure=None,
        arrival=None,
        nights=[],
        days=[SimpleNamespace(
            route_geometry=None,
            stops=[
                SimpleNamespace(longitude=2.3522, latitude=48.8566),
                SimpleNamespace(longitude=None, latitude=None),
                SimpleNamespace(longitude=400, latitude=48),
            ],
        )],
    )

    assert pdf_export._trip_points(trip) == [(2.3522, 48.8566)]


def test_map_bounds_match_the_pdf_frame_without_stretching() -> None:
    width, height = 175, 52
    fitted = pdf_export._fit_map_bounds((2.0, 8.0, 41.0, 51.0), width, height)
    left, top = pdf_export._mercator_world(fitted[0], fitted[3], 0)
    right, bottom = pdf_export._mercator_world(fitted[1], fitted[2], 0)

    assert (right - left) / (bottom - top) == pytest.approx(width / height)


def test_map_markers_use_stop_order_instead_of_day_number() -> None:
    stops = [
        SimpleNamespace(longitude=2.30, latitude=48.80),
        SimpleNamespace(longitude=2.35, latitude=48.85),
        SimpleNamespace(longitude=2.40, latitude=48.90),
    ]
    day = SimpleNamespace(day_number=7, sort_order=0, color="#0FA68A", route_geometry=None, stops=stops)
    trip = SimpleNamespace(days=[day], nights=[], departure=None, arrival=None, map=SimpleNamespace(country=None))

    drawing = pdf_export._overview_map(trip, "fr", width=175, height=52, inset=False)
    marker_labels = [item.text for item in drawing.contents if isinstance(item, String) and item.fontName == "Helvetica-Bold"]

    assert marker_labels == ["1", "2", "3"]


def test_daily_map_includes_departure_and_arrival_markers() -> None:
    departure = SimpleNamespace(longitude=2.20, latitude=48.80)
    arrival = SimpleNamespace(longitude=2.50, latitude=48.95)
    stops = [
        SimpleNamespace(id=uuid4(), longitude=2.30, latitude=48.85, sort_order=0),
        SimpleNamespace(id=uuid4(), longitude=2.40, latitude=48.90, sort_order=1),
    ]
    day = SimpleNamespace(
        id=uuid4(), day_number=1, sort_order=0, color="#0FA68A", route_geometry=None,
        route_segments=[], stops=stops, previous_night=None, next_night=None,
    )
    trip = SimpleNamespace(days=[day], nights=[], departure=departure, arrival=arrival, map=SimpleNamespace(country=None))
    day.trip = trip

    drawing = pdf_export._overview_map(trip, "fr", width=175, height=52, inset=False, selected_days=(day,), selected_points=pdf_export._day_trip_points(trip, day))
    marker_labels = [item.text for item in drawing.contents if isinstance(item, String) and item.fontName == "Helvetica-Bold"]

    assert marker_labels == ["1", "2", "D", "A"]


def test_route_connector_displays_distance_and_duration_between_cards() -> None:
    first = SimpleNamespace(
        id=uuid4(), name="Premier lieu", longitude=2.30, latitude=48.85, sort_order=0,
        planned_arrival=None, visit_duration_minutes=45, address=None,
    )
    second = SimpleNamespace(
        id=uuid4(), name="Deuxième lieu", longitude=2.40, latitude=48.90, sort_order=1,
        planned_arrival=None, visit_duration_minutes=30, address=None,
    )
    departure = SimpleNamespace(longitude=2.20, latitude=48.80)
    day = SimpleNamespace(
        day_number=1, sort_order=0, stops=[first, second], previous_night=None, next_night=None,
        route_segments=[
            {"to": f"stop:{first.id}", "duration_seconds": 600, "routable": True},
            {"to": f"stop:{second.id}", "duration_seconds": 900, "routable": True},
        ],
    )
    trip = SimpleNamespace(days=[day], nights=[], departure=departure, arrival=None)
    day.trip = trip

    first_segment = pdf_export._route_segment_before_entry(day, first, None, 1)
    second_segment = pdf_export._route_segment_before_entry(day, second, None, 2)
    assert first_segment == day.route_segments[0]
    assert second_segment == day.route_segments[1]
    first_segment["distance_meters"] = 1_800
    connector = pdf_export._route_connector(first_segment, "fr", pdf_export._styles("Helvetica", "Helvetica-Bold"))
    pill = connector._cellvalues[1][0]
    label = pill._cellvalues[0][1]
    assert "1,8 km" in label.text
    assert "10 min" in label.text

    detail = pdf_export._stop_description(first, [], "fr", pdf_export._styles("Helvetica", "Helvetica-Bold"))[1].text
    assert "Trajet depuis le point précédent" not in detail
