from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.countries.models import Country
from app.main import app
from app.exports import temporary_exports
from app.maps.models import MapMembership, PoiMap
from app.trips.models import Trip, TripDay, TripDeparture, TripNight, TripStop
from app.trips.router import get_routing_provider
from app.trips.routing.base import MatrixResult, RouteResult, RoutingProvider

pytestmark = pytest.mark.integration

JPEG_BYTES = b"\xff\xd8\xff\xe0trip-night-photo\xff\xd9"


class StubRoutingProvider(RoutingProvider):
    def calculate_route(self, coordinates, profile="driving"):
        return RouteResult({"type": "LineString", "coordinates": [list(item) for item in coordinates]}, 1500, 420, [{"distance_meters": 750, "duration_seconds": 210} for _ in coordinates[1:]])

    def calculate_matrix(self, coordinates, profile="driving"):
        size = len(coordinates); values = [[0 if source == target else abs(source - target) * 10 for target in range(size)] for source in range(size)]
        return MatrixResult(values, values)


class StubGoogleRoutingProvider(StubRoutingProvider):
    provider_id = "google"
    label = "Google Routes"


class FailingGoogleRoutingProvider(StubGoogleRoutingProvider):
    def calculate_route(self, coordinates, profile="driving"):
        from app.trips.routing.base import RoutingError
        raise RoutingError("Google timeout", "GOOGLE_ROUTES_TIMEOUT")


def test_trip_night_description_and_private_photo_are_not_media(integration_client, photo_storage, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Nuits privées"}).json()
    second = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={
            "previous_day_id": trip["days"][0]["id"],
            "next_day_id": second["id"],
            "name": "Hôtel test",
            "latitude": 48.4,
            "longitude": 2.3,
        },
    ).json()

    described = integration_client.patch(f"/trip-nights/{night['id']}", json={"description": "Réservation confirmée."})
    uploaded = integration_client.post(
        f"/trip-nights/{night['id']}/photo",
        files={"file": ("hotel.jpg", JPEG_BYTES, "image/jpeg")},
    )

    assert described.status_code == 200
    assert described.json()["description"] == "Réservation confirmée."
    assert uploaded.status_code == 200
    assert uploaded.json()["photo_id"] is not None
    assert "photo_path" not in uploaded.json()
    assert integration_client.get(f"/trip-nights/{night['id']}/photo").content == JPEG_BYTES
    assert uploaded.json()["photo_id"] not in {item["id"] for item in integration_client.get("/media").json()["items"]}

    removed = integration_client.delete(f"/trip-nights/{night['id']}/photo")
    assert removed.status_code == 200
    assert removed.json()["photo_id"] is None
    assert integration_client.get(f"/trip-nights/{night['id']}/photo").status_code == 404


def test_archiving_a_trip_marks_it_completed_and_keeps_it_listed(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "À terminer"}).json()

    archived = integration_client.post(f"/trips/{trip['id']}/archive")

    assert archived.status_code == 200
    assert archived.json()["status"] == "completed"
    assert archived.json()["completed_at"] is not None
    assert archived.json()["archived_at"] is None
    assert trip["id"] in {item["id"] for item in integration_client.get(f"/maps/{poi_map.id}/trips").json()}

    restored = integration_client.post(f"/trips/{trip['id']}/unarchive")
    assert restored.status_code == 200
    assert restored.json()["status"] == "in_progress"
    assert restored.json()["completed_at"] is None


def test_new_trip_stop_uses_place_visit_duration_or_thirty_minutes(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Durées"}).json()
    day_id = trip["days"][0]["id"]
    configured = integration_client.post(
        "/places",
        json={"name": "Musée", "map_id": str(poi_map.id), "latitude": 48.2, "longitude": 2.2, "default_visit_duration_minutes": 75},
    ).json()
    fallback = integration_client.post(
        "/places",
        json={"name": "Belvédère", "map_id": str(poi_map.id), "latitude": 48.3, "longitude": 2.3},
    ).json()

    configured_stop = integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": configured["id"]})
    fallback_stop = integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": fallback["id"]})
    explicit_stop = integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": configured["id"], "visit_duration_minutes": 15})

    assert configured_stop.status_code == fallback_stop.status_code == explicit_stop.status_code == 201
    assert configured_stop.json()["visit_duration_minutes"] == 75
    assert fallback_stop.json()["visit_duration_minutes"] == 30
    assert explicit_stop.json()["visit_duration_minutes"] == 15

    updated = integration_client.patch(f"/trip-stops/{configured_stop.json()['id']}", json={"visit_duration_minutes": 90})
    assert updated.status_code == 200
    assert updated.json()["visit_duration_minutes"] == 90


def test_trip_pdf_export_is_permission_aware_and_downloadable(integration_client, poi_map, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(temporary_exports, "EXPORT_ROOT", tmp_path)
    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": "Séjour été", "start_date": "2026-08-01", "end_date": "2026-08-01"},
    ).json()
    day_id = trip["days"][0]["id"]
    created_stop = integration_client.post(
        f"/trip-days/{day_id}/stops",
        json={"stop_type": "free_location", "name": "Musée 日本", "latitude": 48.8566, "longitude": 2.3522, "visit_duration_minutes": 45},
    )
    assert created_stop.status_code == 201

    exported = integration_client.post(f"/trips/{trip['id']}/exports/pdf", json={})

    assert exported.status_code == 201
    assert exported.json()["file_name"] == "sejour-ete.pdf"
    downloaded = integration_client.get(exported.json()["download_url"])
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.content.startswith(b"%PDF-1.4")


def test_trip_days_stops_nights_reorder_summary_and_permissions(integration_client, database_session, poi_map, auth_user, france_country) -> None:
    created = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Road trip", "start_date": "2026-08-01", "end_date": "2026-08-03"})
    assert created.status_code == 201
    created_trip = created.json()
    trip_id = created_trip["id"]
    assert created_trip["end_date"] == "2026-08-01"
    assert created_trip["days"][0]["date"] == "2026-08-01"
    # A trip owns its first day on creation; add only the two extra days.
    days = [created_trip["days"][0], *[integration_client.post(f"/trips/{trip_id}/days", json={"title": f"Étape {index}"}).json() for index in range(2, 4)]]
    assert [item["day_number"] for item in days] == [1, 2, 3]
    dated_trip = integration_client.get(f"/trips/{trip_id}").json()
    assert dated_trip["end_date"] == "2026-08-03"
    assert [item["date"] for item in dated_trip["days"]] == ["2026-08-01", "2026-08-02", "2026-08-03"]
    manual_end = integration_client.patch(f"/trips/{trip_id}", json={"end_date": "2026-07-31"})
    assert manual_end.status_code == 200 and manual_end.json()["end_date"] == "2026-08-03"
    shifted = integration_client.patch(f"/trips/{trip_id}", json={"start_date": "2026-08-10"})
    assert shifted.status_code == 200 and shifted.json()["end_date"] == "2026-08-12"
    assert [item["date"] for item in shifted.json()["days"]] == ["2026-08-10", "2026-08-11", "2026-08-12"]
    assert integration_client.patch(f"/trips/{trip_id}", json={"name": None}).status_code == 422

    place = integration_client.post("/places", json={"name": "POI voyage", "map_id": str(poi_map.id), "latitude": 48.2, "longitude": 6.4}).json()
    first = integration_client.post(f"/trip-days/{days[0]['id']}/stops", json={"place_id": place["id"]})
    free = integration_client.post(f"/trip-days/{days[0]['id']}/stops", json={"stop_type": "restaurant", "name": "Restaurant libre", "latitude": 48.3, "longitude": 6.5, "visit_duration_minutes": 60})
    assert first.status_code == free.status_code == 201
    assert first.json()["name"] == "POI voyage"

    night = integration_client.post(f"/trips/{trip_id}/nights", json={"previous_day_id": days[0]["id"], "next_day_id": days[1]["id"], "name": "Hôtel", "latitude": 48.4, "longitude": 6.6, "google_place_id": "ChIJ-hotel-official"})
    assert night.status_code == 201
    assert night.json()["google_place_id"] == "ChIJ-hotel-official"
    invalid_night = integration_client.post(f"/trips/{trip_id}/nights", json={"previous_day_id": days[0]["id"], "next_day_id": days[2]["id"], "name": "Invalide", "latitude": 48, "longitude": 6})
    assert invalid_night.status_code == 422
    assert integration_client.post(f"/trips/{trip_id}/days/reorder", json={"ids": [days[1]["id"], days[0]["id"], days[2]["id"]]}).status_code == 200
    assert integration_client.post(f"/trips/{trip_id}/days/reorder", json={"ids": [days[0]["id"], days[1]["id"], days[2]["id"]]}).status_code == 200

    reordered = integration_client.post(f"/trip-days/{days[0]['id']}/stops/reorder", json={"ids": [free.json()["id"], first.json()["id"]]})
    assert reordered.status_code == 200 and reordered.json()["route_status"] is None
    moved = integration_client.post(f"/trip-stops/{first.json()['id']}/move", json={"target_day_id": days[1]["id"], "sort_order": 0})
    assert moved.status_code == 200
    assert moved.json()["days"][1]["stops"][0]["id"] == first.json()["id"]

    summary = integration_client.get(f"/trips/{trip_id}/summary")
    assert summary.status_code == 200 and summary.json()["days"] == 3 and summary.json()["nights"] == 1 and summary.json()["stops"] == 2
    assert summary.json()["days_with_route"] == 0
    assert summary.json()["days_without_route"] == 3
    assert summary.json()["is_route_summary_complete"] is False

    # A middle-day deletion also removes its obsolete overnight link and compacts ordering.
    removed_day = integration_client.delete(f"/trip-days/{days[1]['id']}")
    assert removed_day.status_code == 204
    after_removal = integration_client.get(f"/trips/{trip_id}").json()
    assert [item["day_number"] for item in after_removal["days"]] == [1, 2]
    assert after_removal["end_date"] == "2026-08-11"
    assert [item["date"] for item in after_removal["days"]] == ["2026-08-10", "2026-08-11"]
    assert after_removal["nights"] == []

    viewer = User(email=f"viewer-{uuid4()}@example.test", display_name="Viewer", password_hash="x", is_active=True, is_admin=False)
    database_session.add(viewer); database_session.flush(); database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer")); database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: viewer
    try:
        assert integration_client.get(f"/trips/{trip_id}").status_code == 200
        assert integration_client.patch(f"/trips/{trip_id}", json={"name": "Interdit"}).status_code == 403
        assert integration_client.put(f"/trips/{trip_id}/state", json=after_removal).status_code == 403
        assert integration_client.post(f"/trips/{trip_id}/exports/google-maps", json={}).status_code == 200
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user


def test_inserting_a_day_reindexes_following_days_and_preserves_overnight_order(integration_client, poi_map) -> None:
    created = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Insertion de journée"}).json()
    trip_id = created["id"]
    first = created["days"][0]
    second = integration_client.post(f"/trips/{trip_id}/days", json={"title": "Jour final"}).json()
    night = integration_client.post(
        f"/trips/{trip_id}/nights",
        json={"previous_day_id": first["id"], "next_day_id": second["id"], "name": "Nuit existante", "latitude": 48.4, "longitude": 6.6},
    )
    assert night.status_code == 201

    inserted = integration_client.post(f"/trips/{trip_id}/days", json={"after_day_id": first["id"], "title": "Jour inséré"})

    assert inserted.status_code == 201
    loaded = integration_client.get(f"/trips/{trip_id}").json()
    assert [item["id"] for item in loaded["days"]] == [first["id"], inserted.json()["id"], second["id"]]
    assert [item["day_number"] for item in loaded["days"]] == [1, 2, 3]
    assert [item["sort_order"] for item in loaded["days"]] == [0, 1, 2]
    assert [(item["previous_day_id"], item["next_day_id"]) for item in loaded["nights"]] == [(inserted.json()["id"], second["id"])]

    before_invalid = loaded
    invalid = integration_client.post(f"/trips/{trip_id}/days", json={"after_day_id": str(uuid4())})
    assert invalid.status_code == 422
    assert integration_client.get(f"/trips/{trip_id}").json()["days"] == before_invalid["days"]


def test_reordering_days_moves_their_night_and_drops_the_new_last_night(integration_client, poi_map) -> None:
    created = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Réorganisation des nuits"}).json()
    trip_id = created["id"]
    first = created["days"][0]
    second = integration_client.post(f"/trips/{trip_id}/days", json={"title": "Deuxième"}).json()
    third = integration_client.post(f"/trips/{trip_id}/days", json={"title": "Dernier"}).json()
    first_night = integration_client.post(
        f"/trips/{trip_id}/nights",
        json={"previous_day_id": first["id"], "next_day_id": second["id"], "name": "Nuit du premier", "latitude": 48.4, "longitude": 6.6},
    ).json()
    integration_client.post(
        f"/trips/{trip_id}/nights",
        json={"previous_day_id": second["id"], "next_day_id": third["id"], "name": "Nuit du deuxième", "latitude": 48.5, "longitude": 6.7},
    )

    response = integration_client.post(
        f"/trips/{trip_id}/days/reorder",
        json={"ids": [third["id"], first["id"], second["id"]]},
    )

    assert response.status_code == 200
    reordered = response.json()
    assert [day["id"] for day in reordered["days"]] == [third["id"], first["id"], second["id"]]
    assert len(reordered["nights"]) == 1
    assert reordered["nights"][0]["id"] == first_night["id"]
    assert reordered["nights"][0]["previous_day_id"] == first["id"]
    assert reordered["nights"][0]["next_day_id"] == second["id"]


def test_removing_a_middle_stop_compacts_the_day_order(integration_client, poi_map) -> None:
    trip = integration_client.post(
        f"/maps/{poi_map.id}/trips",
        json={"name": "Suppression d’étape"},
    ).json()
    day = trip["days"][0]
    stops = [
        integration_client.post(
            f"/trip-days/{day['id']}/stops",
            json={
                "stop_type": "free_location",
                "name": f"Étape {index}",
                "latitude": 48 + index / 100,
                "longitude": 2 + index / 100,
            },
        ).json()
        for index in range(5)
    ]

    removed = integration_client.delete(f"/trip-stops/{stops[2]['id']}")
    assert removed.status_code == 204

    reloaded = integration_client.get(f"/trips/{trip['id']}")
    assert reloaded.status_code == 200
    remaining = reloaded.json()["days"][0]["stops"]
    assert [item["id"] for item in remaining] == [
        stops[0]["id"],
        stops[1]["id"],
        stops[3]["id"],
        stops[4]["id"],
    ]
    assert [item["sort_order"] for item in remaining] == [0, 1, 2, 3]


def test_trip_state_can_restore_deleted_days_stops_and_nights(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Historique rÃ©versible"}).json()
    first = trip["days"][0]
    second = integration_client.post(f"/trips/{trip['id']}/days", json={"title": "DeuxiÃ¨me jour"}).json()
    stop = integration_client.post(
        f"/trip-days/{second['id']}/stops",
        json={"stop_type": "free_location", "name": "Ã‰tape restaurÃ©e", "latitude": 48.1, "longitude": 2.1},
    ).json()
    night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={"previous_day_id": first["id"], "next_day_id": second["id"], "name": "Nuit restaurÃ©e", "latitude": 48.2, "longitude": 2.2},
    ).json()
    snapshot = integration_client.get(f"/trips/{trip['id']}").json()

    assert integration_client.delete(f"/trip-days/{second['id']}").status_code == 204
    restored = integration_client.put(f"/trips/{trip['id']}/state", json=snapshot)

    assert restored.status_code == 200, restored.text
    payload = restored.json()
    assert [day["id"] for day in payload["days"]] == [first["id"], second["id"]]
    assert payload["days"][1]["stops"][0]["id"] == stop["id"]
    assert payload["nights"][0]["id"] == night["id"]


def test_trip_rejects_place_from_another_map(integration_client, database_session, poi_map, auth_user, france_country) -> None:
    from app.statuses.service import create_default_statuses

    other_country = database_session.scalar(select(Country).where(Country.id != france_country.id).order_by(Country.iso_alpha2))
    assert other_country is not None
    other = PoiMap(name=f"Other {uuid4()}", country_id=other_country.id, owner_id=auth_user.id, is_private=True)
    database_session.add(other); database_session.flush(); database_session.add(MapMembership(map_id=other.id, user_id=auth_user.id, role="owner")); create_default_statuses(database_session, other.id); database_session.flush()
    place = integration_client.post("/places", json={"name": "Other", "map_id": str(other.id), "latitude": 47, "longitude": 5}).json()
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Protected"}).json()
    day = trip["days"][0]
    assert integration_client.post(f"/trip-days/{day['id']}/stops", json={"place_id": place["id"]}).status_code == 422
    assert database_session.scalar(select(TripStop).where(TripStop.trip_day_id == day["id"])) is None


def test_confirming_optimization_reorders_and_recalculates_route(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Optimisation"}).json()
    day = trip["days"][0]
    stops = [integration_client.post(f"/trip-days/{day['id']}/stops", json={"stop_type": "free_location", "name": f"Étape {index}", "latitude": 48 + index / 10, "longitude": 2 + index / 10}).json() for index in range(3)]
    app.dependency_overrides[get_routing_provider] = lambda: StubRoutingProvider()
    try:
        response = integration_client.post(f"/trip-days/{day['id']}/optimize/confirm", json={"stop_ids": [stops[2]["id"], stops[1]["id"], stops[0]["id"]]})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["stops"]] == [stops[2]["id"], stops[1]["id"], stops[0]["id"]]
    assert response.json()["route_status"] == "ready"
    assert response.json()["route_geometry"]["type"] == "LineString"


def test_day_routes_and_optimization_keep_departure_and_night_as_fixed_anchors(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Voyage ancré"}).json()
    first = trip["days"][0]
    second = integration_client.post(f"/trips/{trip['id']}/days", json={}).json()
    departure = integration_client.post(
        f"/trips/{trip['id']}/departure",
        json={"name": "Maison", "latitude": 48.0, "longitude": 2.0},
    )
    assert departure.status_code == 201
    night = integration_client.post(
        f"/trips/{trip['id']}/nights",
        json={"previous_day_id": first["id"], "next_day_id": second["id"], "name": "Hôtel", "latitude": 49.0, "longitude": 3.0},
    )
    assert night.status_code == 201
    stops = [
        integration_client.post(
            f"/trip-days/{first['id']}/stops",
            json={"stop_type": "free_location", "name": f"Étape {index}", "latitude": 48.2 + index / 10, "longitude": 2.2 + index / 10},
        ).json()
        for index in range(2)
    ]
    app.dependency_overrides[get_routing_provider] = lambda: StubRoutingProvider()
    try:
        route = integration_client.post(f"/trip-days/{first['id']}/route", json={})
        optimized = integration_client.post(f"/trip-days/{first['id']}/optimize", json={})
        summary = integration_client.get(f"/trips/{trip['id']}/summary")
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert route.status_code == 200
    coordinates = route.json()["route_geometry"]["coordinates"]
    assert coordinates[0] == [2.0, 48.0]
    assert coordinates[-1] == [3.0, 49.0]
    assert coordinates[1][0] == pytest.approx(2.2)
    assert coordinates[2][0] == pytest.approx(2.3)
    assert route.json()["route_segments"][0]["from"].startswith("departure:")
    assert route.json()["route_segments"][-1]["to"].startswith("night:")
    assert summary.json()["total_route_distance_meters"] == 1500
    assert summary.json()["total_route_duration_seconds"] == 420
    assert summary.json()["days_with_route"] == 1
    assert summary.json()["days_without_route"] == 1
    assert summary.json()["is_route_summary_complete"] is False
    assert optimized.status_code == 200
    assert optimized.json()["before"] == 30
    assert optimized.json()["before_distance_meters"] == 30
    assert optimized.json()["before_duration_seconds"] == 30
    assert optimized.json()["distance_gain_meters"] >= 0
    assert optimized.json()["duration_gain_seconds"] >= 0
    assert set(optimized.json()["optimized_stop_ids"]) == {item["id"] for item in stops}
    updated_departure = integration_client.patch(
        f"/trip-departures/{departure.json()['id']}",
        json={"name": "Nouveau départ", "latitude": 47.5, "longitude": 1.5},
    )
    assert updated_departure.status_code == 200
    assert updated_departure.json()["name"] == "Nouveau départ"
    assert integration_client.delete(f"/trip-departures/{departure.json()['id']}").status_code == 204


def test_google_provider_is_persisted_and_failed_recalculation_keeps_previous_route(integration_client, poi_map) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Google route"}).json()
    day = trip["days"][0]
    for index in range(2):
        assert integration_client.post(
            f"/trip-days/{day['id']}/stops",
            json={"stop_type": "free_location", "name": f"Point {index}", "latitude": 48 + index, "longitude": 2 + index},
        ).status_code == 201
    app.dependency_overrides[get_routing_provider] = lambda: StubGoogleRoutingProvider()
    try:
        routed = integration_client.post(f"/trip-days/{day['id']}/route", json={})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert routed.status_code == 200
    assert routed.json()["route_provider"] == "google"
    previous_geometry = routed.json()["route_geometry"]
    summary = integration_client.get(f"/trip-days/{day['id']}/summary")
    assert summary.json()["route_provider_label"] == "Google Routes"

    app.dependency_overrides[get_routing_provider] = lambda: FailingGoogleRoutingProvider()
    try:
        failed = integration_client.post(f"/trip-days/{day['id']}/route/recalculate", json={})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert failed.status_code == 502
    assert failed.json()["detail"]["code"] == "GOOGLE_ROUTES_TIMEOUT"
    current = integration_client.get(f"/trips/{trip['id']}").json()["days"][0]
    assert current["route_provider"] == "google"
    assert current["route_geometry"] == previous_geometry


def test_trip_time_planning_settings_summaries_and_permissions(integration_client, database_session, poi_map, auth_user) -> None:
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Planification horaire"}).json()
    day = trip["days"][0]
    stops = [
        integration_client.post(
            f"/trip-days/{day['id']}/stops",
            json={"stop_type": "free_location", "name": f"Visite {index}", "latitude": 48 + index / 10, "longitude": 2 + index / 10, "visit_duration_minutes": 30},
        ).json()
        for index in range(2)
    ]
    app.dependency_overrides[get_routing_provider] = lambda: StubRoutingProvider()
    try:
        routed = integration_client.post(f"/trip-days/{day['id']}/route", json={})
    finally:
        app.dependency_overrides.pop(get_routing_provider, None)
    assert routed.status_code == 200

    timing = integration_client.patch(
        f"/trip-days/{day['id']}/timing",
        json={"target_arrival_time": "10:00", "default_stop_buffer_minutes": 15, "safety_margin_type": "percentage", "safety_margin_value": 10},
    )
    assert timing.status_code == 200
    payload = timing.json()
    assert payload["buffer_duration_minutes"] == 15
    assert payload["pause_duration_minutes"] == 0
    assert payload["recommended_start_time"] is not None
    assert payload["estimated_arrival_time"] is not None
    assert payload["load_level"] == "low"

    load = integration_client.patch(
        f"/trips/{trip['id']}/load-settings",
        json={"low_load_max_minutes": 60, "medium_load_max_minutes": 90, "low_load_color": "#111111", "medium_load_color": "#222222", "high_load_color": "#333333"},
    )
    assert load.status_code == 200
    summary = integration_client.get(f"/trip-days/{day['id']}/summary")
    assert summary.status_code == 200
    assert summary.json()["load_level"] == "high"
    assert summary.json()["load_color"] == "#333333"

    changed_visit = integration_client.patch(f"/trip-stops/{stops[0]['id']}", json={"visit_duration_minutes": 45})
    assert changed_visit.status_code == 200
    reloaded = integration_client.get(f"/trips/{trip['id']}").json()
    assert reloaded["days"][0]["route_status"] == "ready"
    assert integration_client.get(f"/trip-days/{day['id']}/summary").json()["visit_duration_minutes"] == 75

    viewer = User(email=f"time-viewer-{uuid4()}@example.test", display_name="Viewer", password_hash="x", is_active=True, is_admin=False)
    database_session.add(viewer); database_session.flush(); database_session.add(MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer")); database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: viewer
    try:
        assert integration_client.get(f"/trip-days/{day['id']}/summary").status_code == 200
        assert integration_client.patch(f"/trip-days/{day['id']}/timing", json={"target_arrival_time": None, "default_stop_buffer_minutes": 0, "safety_margin_type": "fixed", "safety_margin_value": 0}).status_code == 403
        assert integration_client.patch(f"/trips/{trip['id']}/load-settings", json={"low_load_max_minutes": 240, "medium_load_max_minutes": 480, "low_load_color": "#0FA68A", "medium_load_color": "#D97706", "high_load_color": "#DC2626"}).status_code == 403
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user
