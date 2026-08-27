from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select

from app.auth.dependencies import get_current_session, require_admin
from app.auth.models import AuthSecurityEvent, UserApiCredential, UserSession
from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.places.models import Place, PlaceLink
from app.photos.models import Photo
from app.places.models import Place
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop
from app.main import app
from app.privacy.router import _data_export
from app.privacy.service import purge_expired_privacy_artifacts
from app.privacy.settings import PrivacySettings


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
