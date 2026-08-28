from __future__ import annotations

from io import BytesIO
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy import event

from app.auth.dependencies import get_current_session, require_admin
from app.auth.models import AuthSecurityEvent, User, UserApiCredential, UserSession
from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.categories.models import Category
from app.places.models import Place, PlaceHistory, PlaceLink
from app.photos.models import Photo
from app.tags.models import Tag
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop
from app.main import app
from app.maps.models import PoiMap
from app.privacy import router as privacy_router
from app.privacy.router import _create_export_archive, _data_export
from app.privacy.service import purge_expired_privacy_artifacts
from app.privacy.settings import PrivacySettings


def _track_export_tempfiles(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> list[Path]:
    created: list[Path] = []
    named_temporary_file = privacy_router.tempfile.NamedTemporaryFile

    def tracked_named_temporary_file(*args, **kwargs):
        temporary = named_temporary_file(*args, dir=tmp_path, **kwargs)
        created.append(Path(temporary.name))
        return temporary

    monkeypatch.setattr(privacy_router.tempfile, "NamedTemporaryFile", tracked_named_temporary_file)
    return created


def test_privacy_configuration_is_disabled_by_default(integration_client):
    response = integration_client.get("/privacy/configuration")

    assert response.status_code == 200
    assert response.json()["analytics_mode"] == "disabled"
    assert response.json()["consent_required"] is False


def test_admin_can_configure_privacy_and_user_can_manage_consent(integration_client, database_session, auth_user):
    app.dependency_overrides[get_current_session] = lambda: SimpleNamespace(user=auth_user)
    app.dependency_overrides[require_admin] = lambda: auth_user
    try:
        settings = integration_client.put("/admin/console/privacy/settings", json={
            "analytics_mode": "consent_required",
            "operator_name": "CartaVault SAS",
            "privacy_policy_url": "https://example.test/privacy",
            "cookie_policy_url": "https://example.test/cookies",
            "contact_email": "privacy@example.test",
            "auth_log_retention_days": 45,
            "session_retention_days": 30,
            "deleted_account_retention_days": 0,
        })
        assert settings.status_code == 200
        assert settings.json()["consent_required"] is True

        saved = integration_client.put("/account/privacy/consent", json={"analytics": True, "functional_optional": False, "marketing": False, "third_party": False})
        assert saved.status_code == 200
        assert saved.json()["analytics"] is True
        assert saved.json()["necessary"] is True
        assert saved.json()["updated_at"] is not None

        read = integration_client.get("/account/privacy/consent")
        assert read.status_code == 200
        assert read.json()["analytics"] is True
    finally:
        app.dependency_overrides.pop(get_current_session, None)
        app.dependency_overrides.pop(require_admin, None)


def test_admin_rejects_an_invalid_privacy_contact_email(integration_client, auth_user):
    app.dependency_overrides[require_admin] = lambda: auth_user
    try:
        response = integration_client.put("/admin/console/privacy/settings", json={"contact_email": "admin-at-example.fr"})

        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(require_admin, None)


def test_personal_export_endpoint_preserves_zip_and_json_contract(
    integration_client,
    database_session,
    auth_user,
    poi_map,
):
    representative_text = 'Café "Étoile" \\ détour\nligne suivante'
    auth_user.display_name = representative_text
    poi_map.name = representative_text
    category = Category(
        map_id=poi_map.id,
        name="Musées & galeries",
        icon="material-symbols:museum-outline",
        description=representative_text,
    )
    tag = Tag(map_id=poi_map.id, name="À revoir", color="#0FA68A")
    place = Place(
        name=representative_text,
        description=representative_text,
        map_id=poi_map.id,
        status_id=poi_map.statuses[0].id,
        location="SRID=4326;POINT(2.3522 48.8566)",
        interest_rating=4.5,
        custom_fields={"quoted": representative_text},
    )
    template = AnnotationTemplate(map_id=poi_map.id, name="Zone spéciale", shape_type="circle")
    database_session.add_all([category, tag, place, template])
    database_session.flush()
    link = PlaceLink(place_id=place.id, url="https://example.test/portable", label=representative_text)
    photo = Photo(
        place_id=place.id,
        map_id=poi_map.id,
        storage_scope_id=uuid4(),
        filename="portable.jpg",
        original_name=representative_text,
        path="/srv/cartavault/private/photo-original.jpg",
        mime_type="image/jpeg",
        file_size_bytes=321,
        width=640,
        height=480,
        description=representative_text,
        uploaded_by_user_id=auth_user.id,
    )
    annotation = PlaceAnnotation(
        place_id=place.id,
        template_id=template.id,
        geometry={"type": "Point", "coordinates": [2.3522, 48.8566]},
        radius_meters=15,
        title=representative_text,
    )
    history = PlaceHistory(
        place_id=place.id,
        user_id=auth_user.id,
        action="updated",
        changes={"description": {"after": representative_text}},
    )
    trip = Trip(map_id=poi_map.id, created_by_user_id=auth_user.id, name=representative_text, description=representative_text)
    database_session.add_all([link, photo, annotation, history, trip])
    database_session.flush()
    first_day = TripDay(trip_id=trip.id, day_number=1, title="Jour un", notes=representative_text, sort_order=0)
    second_day = TripDay(trip_id=trip.id, day_number=2, title="Jour deux", sort_order=1)
    database_session.add_all([first_day, second_day])
    database_session.flush()
    stop = TripStop(
        trip_day_id=first_day.id,
        place_id=place.id,
        stop_type="place",
        name=representative_text,
        latitude=48.8566,
        longitude=2.3522,
        sort_order=0,
        notes=representative_text,
    )
    night = TripNight(
        trip_id=trip.id,
        previous_day_id=first_day.id,
        next_day_id=second_day.id,
        place_id=place.id,
        name=representative_text,
        latitude=48.8566,
        longitude=2.3522,
        notes=representative_text,
    )
    departure = TripDeparture(trip_id=trip.id, place_id=place.id, name="Départ", latitude=48.8566, longitude=2.3522)
    arrival = TripArrival(trip_id=trip.id, place_id=place.id, name="Arrivée", latitude=48.8566, longitude=2.3522)
    database_session.add_all([stop, night, departure, arrival])
    database_session.flush()
    night_photo = TripNightPhoto(
        night_id=night.id,
        file_path="/srv/cartavault/private/night-original.jpg",
        mime_type="image/jpeg",
        file_size_bytes=654,
        sort_order=0,
    )
    credential = UserApiCredential(
        user_id=auth_user.id,
        provider="google",
        name="Private export key",
        encrypted_secret="encrypted-provider-secret-must-not-leak",
        encryption_version=1,
        secret_last4="9876",
    )
    other_user = User(
        email=f"privacy-other-{uuid4()}@example.test",
        display_name="Other privacy user",
        password_hash="test-only",
        is_active=True,
    )
    database_session.add(other_user)
    database_session.flush()
    other_map = PoiMap(
        name="Other private map",
        country_id=poi_map.country_id,
        owner_id=other_user.id,
        is_private=True,
    )
    other_photo_marker = f"other-private-{uuid4()}.jpg"
    other_photo = Photo(
        storage_scope_id=uuid4(),
        filename=other_photo_marker,
        original_name=other_photo_marker,
        uploaded_by_user_id=other_user.id,
    )
    database_session.add_all([night_photo, credential, other_map, other_photo])
    database_session.commit()

    expected = jsonable_encoder(_data_export(database_session, auth_user))
    app.dependency_overrides[get_current_session] = lambda: SimpleNamespace(user=auth_user)
    try:
        response = integration_client.get("/account/privacy/export")
    finally:
        app.dependency_overrides.pop(get_current_session, None)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"] == 'attachment; filename="cartavault-personal-data.zip"'
    assert response.headers["cache-control"] == "no-store"
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == ["cartavault-data.json", "README.txt"]
        assert archive.read("README.txt").decode("utf-8") == (
            "Personal CartaVault data export. Secrets and shared resources owned by other users are excluded.\n"
        )
        exported_json = archive.read("cartavault-data.json").decode("utf-8")
        actual = json.loads(exported_json)

    expected["exported_at"] = None
    actual["exported_at"] = None
    assert actual == expected
    assert actual["places"][0]["latitude"] == 48.8566
    assert actual["places"][0]["longitude"] == 2.3522
    assert actual["places"][0]["interest_rating"] == 4.5
    assert actual["account"]["display_name"] == representative_text
    for section in (
        "owned_maps", "memberships", "categories", "tags", "statuses", "place_links", "media_metadata", "trips",
        "trip_days", "trip_stops", "trip_nights", "trip_night_photos", "trip_departures", "trip_arrivals",
        "annotation_templates", "annotations", "place_history",
    ):
        assert actual[section]
    assert "/srv/cartavault/private/photo-original.jpg" not in exported_json
    assert "/srv/cartavault/private/night-original.jpg" not in exported_json
    assert "encrypted-provider-secret-must-not-leak" not in exported_json
    assert other_photo_marker not in exported_json
    assert auth_user.password_hash not in exported_json
    assert '"path"' not in exported_json
    assert '"file_path"' not in exported_json


def test_personal_export_excludes_credentials_and_media_binary_paths(database_session, auth_user, poi_map):
    database_session.add(UserApiCredential(
        user_id=auth_user.id,
        provider="google",
        name="Private key",
        encrypted_secret="must-never-leak",
        encryption_version=1,
        secret_last4="1234",
    ))
    database_session.flush()

    export = _data_export(database_session, auth_user)
    serialized = json.dumps(export, default=str)

    assert export["account"]["id"] == auth_user.id
    assert poi_map.id in [item["id"] for item in export["owned_maps"]]
    assert "must-never-leak" not in serialized
    assert "password_hash" not in serialized
    assert "encrypted_secret" not in serialized
    assert "path" not in serialized


def test_personal_export_keeps_night_photo_metadata_without_storage_paths(database_session, auth_user, poi_map):
    trip = Trip(map_id=poi_map.id, created_by_user_id=auth_user.id, name="Photo portable")
    database_session.add(trip); database_session.flush()
    first = TripDay(trip_id=trip.id, day_number=1, sort_order=0)
    second = TripDay(trip_id=trip.id, day_number=2, sort_order=1)
    database_session.add_all([first, second]); database_session.flush()
    night = TripNight(trip_id=trip.id, previous_day_id=first.id, next_day_id=second.id, name="Nuit portable", latitude=48, longitude=2)
    database_session.add(night); database_session.flush()
    photo = TripNightPhoto(night_id=night.id, file_path=f"{night.id}/{uuid4()}.jpg", mime_type="image/jpeg", file_size_bytes=123456, sort_order=0)
    database_session.add(photo); database_session.flush()

    export = _data_export(database_session, auth_user)

    exported = next(item for item in export["trip_night_photos"] if item["id"] == photo.id)
    assert exported == {
        "id": photo.id,
        "night_id": night.id,
        "mime_type": "image/jpeg",
        "file_size_bytes": 123456,
        "sort_order": 0,
        "created_at": photo.created_at,
    }
    assert "path" not in json.dumps(export, default=str)
    assert all("path" not in item for item in export["media_metadata"])


def test_personal_export_contains_place_coordinates_media_orphans_and_trip_children(database_session, auth_user, poi_map):
    place = Place(name="Portable place", map_id=poi_map.id, status_id=poi_map.statuses[0].id, location="SRID=4326;POINT(2 48)")
    database_session.add(place); database_session.flush()
    database_session.add(PlaceLink(place_id=place.id, url="https://example.test", label="Site"))
    orphan = Photo(map_id=poi_map.id, storage_scope_id=uuid4(), filename="orphan.jpg", original_name="orphan.jpg", mime_type="image/jpeg", file_size_bytes=12, uploaded_by_user_id=auth_user.id)
    database_session.add(orphan)
    trip = Trip(map_id=poi_map.id, created_by_user_id=auth_user.id, name="Portabilité", status="in_progress")
    database_session.add(trip); database_session.flush()
    first = TripDay(trip_id=trip.id, day_number=1, sort_order=0); second = TripDay(trip_id=trip.id, day_number=2, sort_order=1)
    database_session.add_all([first, second]); database_session.flush()
    database_session.add_all([
        TripStop(trip_day_id=first.id, place_id=place.id, stop_type="place", name=place.name, latitude=48, longitude=2, sort_order=0),
        TripNight(trip_id=trip.id, previous_day_id=first.id, next_day_id=second.id, name="Nuit", latitude=48, longitude=2),
        TripDeparture(trip_id=trip.id, name="Départ", latitude=48, longitude=2),
        TripArrival(trip_id=trip.id, name="Arrivée", latitude=48, longitude=2),
        AnnotationTemplate(map_id=poi_map.id, name="Zone", shape_type="circle"),
    ])
    database_session.flush()
    database_session.commit()

    export = _data_export(database_session, auth_user)
    exported_place = next(item for item in export["places"] if item["id"] == place.id)
    assert exported_place["latitude"] == 48.0 and exported_place["longitude"] == 2.0
    assert any(item["id"] == orphan.id for item in export["media_metadata"])
    assert len(export["trip_days"]) == 2
    assert len(export["trip_stops"]) == len(export["trip_nights"]) == len(export["trip_departures"]) == len(export["trip_arrivals"]) == 1
    assert export["place_links"]
    assert export["annotation_templates"]


def test_personal_export_includes_owned_soft_deleted_data_but_no_security_secrets(database_session, auth_user, poi_map):
    poi_map.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    place = Place(name="Deleted portable place", map_id=poi_map.id, status_id=poi_map.statuses[0].id, location="SRID=4326;POINT(2 48)")
    database_session.add(place); database_session.flush()
    place.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()

    export = _data_export(database_session, auth_user)
    serialized = json.dumps(export, default=str)
    assert any(item["id"] == poi_map.id for item in export["owned_maps"])
    assert any(item["id"] == place.id for item in export["places"])
    assert "password_hash" not in serialized
    assert "totp_secret_encrypted" not in serialized
    assert "token_hash" not in serialized
    assert "csrf_token_hash" not in serialized


def test_personal_export_tempfile_is_removed_after_response(
    integration_client,
    auth_user,
    monkeypatch,
    tmp_path,
):
    created = _track_export_tempfiles(monkeypatch, tmp_path)
    app.dependency_overrides[get_current_session] = lambda: SimpleNamespace(user=auth_user)
    try:
        response = integration_client.get("/account/privacy/export")
    finally:
        app.dependency_overrides.pop(get_current_session, None)

    assert response.status_code == 200
    assert len(created) == 1
    assert not created[0].exists()


def test_personal_export_tempfile_is_removed_if_generation_fails(
    database_session,
    auth_user,
    monkeypatch,
    tmp_path,
):
    created = _track_export_tempfiles(monkeypatch, tmp_path)

    def fail_generation(*_args, **_kwargs):
        raise RuntimeError("test archive generation failure")

    monkeypatch.setattr(privacy_router, "_write_export_json", fail_generation)
    with pytest.raises(RuntimeError, match="test archive generation failure"):
        _create_export_archive(database_session, auth_user)

    assert len(created) == 1
    assert not created[0].exists()


def test_personal_export_place_query_count_has_bounded_growth(database_session, auth_user, poi_map):
    status_id = poi_map.statuses[0].id

    def add_places(start: int, stop: int) -> None:
        database_session.add_all([
            Place(
                name=f"Portable place {index}",
                map_id=poi_map.id,
                status_id=status_id,
                location=f"SRID=4326;POINT(2.{index:03d} 48)",
            )
            for index in range(start, stop)
        ])
        database_session.flush()

    def export_select_count() -> int:
        statements: list[str] = []

        def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(database_session.bind, "before_cursor_execute", record_statement)
        try:
            _data_export(database_session, auth_user)
        finally:
            event.remove(database_session.bind, "before_cursor_execute", record_statement)
        return len(statements)

    add_places(0, 10)
    small_export_queries = export_select_count()
    add_places(10, 100)
    large_export_queries = export_select_count()

    assert small_export_queries <= 25
    assert large_export_queries <= small_export_queries + 2


def test_privacy_cleanup_removes_expired_security_artifacts_only(database_session, auth_user):
    expired = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2)
    event = AuthSecurityEvent(event_type="login", outcome="success", actor_user_id=auth_user.id, occurred_at=expired)
    database_session.add(event)
    database_session.flush()

    purge_expired_privacy_artifacts(database_session, PrivacySettings(auth_log_retention_days=1))

    assert database_session.get(AuthSecurityEvent, event.id) is None


def test_privacy_cleanup_applies_session_retention(database_session, auth_user):
    now = datetime.now(UTC).replace(tzinfo=None)
    stale = UserSession(
        user_id=auth_user.id,
        token_hash="z" * 64,
        csrf_token_hash="y" * 64,
        created_at=now - timedelta(days=31),
        last_used_at=now - timedelta(days=1),
        expires_at=now + timedelta(days=7),
    )
    database_session.add(stale)
    database_session.flush()

    purge_expired_privacy_artifacts(database_session, PrivacySettings(session_retention_days=30))

    assert database_session.get(UserSession, stale.id) is None
