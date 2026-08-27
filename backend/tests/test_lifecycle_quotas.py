from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.categories.models import Category
from app.main import app
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place, PlaceLink
from app.quotas.models import QuotaProfile
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.statuses.service import create_default_statuses
from app.trips.models import Trip, TripDay


pytestmark = pytest.mark.integration


def _profile(database_session, **limits: int | None) -> QuotaProfile:
    profile = QuotaProfile(
        name=f"Lifecycle {uuid4()}",
        is_active=True,
        **limits,
    )
    database_session.add(profile)
    database_session.flush()
    return profile


def _user(database_session, label: str, profile: QuotaProfile | None = None) -> User:
    user = User(
        email=f"{label}-{uuid4()}@example.test",
        display_name=label.title(),
        password_hash="test-only",
        is_admin=False,
        is_active=True,
        quota_profile_id=profile.id if profile else None,
    )
    database_session.add(user)
    database_session.flush()
    return user


def _map(database_session, country, owner: User, name: str) -> PoiMap:
    poi_map = PoiMap(name=name, country_id=country.id, owner_id=owner.id, is_private=True)
    database_session.add(poi_map)
    database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=owner.id, role="owner"))
    create_default_statuses(database_session, poi_map.id)
    database_session.flush()
    return poi_map


def _ownership_invitation(database_session, poi_map: PoiMap, owner: User, target: User) -> MapInvitation:
    invitation = MapInvitation(
        map_id=poi_map.id,
        email=target.email,
        role="owner",
        token_hash=uuid4().hex,
        created_by_user_id=owner.id,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
    )
    database_session.add(invitation)
    database_session.flush()
    return invitation


def _accept_transfer(client, target: User, invitation: MapInvitation):
    app.dependency_overrides[get_current_user] = lambda: target
    return client.post(f"/invitations/pending/{invitation.id}/accept")


def _create_place(client, poi_map: PoiMap, name: str) -> dict:
    response = client.post(
        "/places",
        json={
            "map_id": str(poi_map.id),
            "name": name,
            "latitude": 48.2,
            "longitude": 2.2,
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_trip(client, poi_map: PoiMap, name: str) -> dict:
    response = client.post(f"/maps/{poi_map.id}/trips", json={"name": name})
    assert response.status_code == 201
    return response.json()


def _add_photo(database_session, place_id: UUID, map_id: UUID, uploader_id: UUID, size: int) -> Photo:
    photo = Photo(
        place_id=place_id,
        map_id=map_id,
        storage_scope_id=place_id,
        filename=f"{uuid4()}.jpg",
        file_size_bytes=size,
        uploaded_by_user_id=uploader_id,
        sort_order=0,
        is_primary=True,
    )
    database_session.add(photo)
    database_session.flush()
    return photo


def _assert_transfer_unchanged(database_session, poi_map: PoiMap, owner: User, target: User) -> None:
    database_session.expire_all()
    assert database_session.get(PoiMap, poi_map.id).owner_id == owner.id
    roles = {
        item.user_id: item.role
        for item in database_session.scalars(
            select(MapMembership).where(MapMembership.map_id == poi_map.id)
        )
    }
    assert roles == {owner.id: "owner"}
    assert target.id not in roles


def test_ownership_transfer_moves_accounted_usage_exactly_once(
    integration_client, database_session, auth_user, poi_map
) -> None:
    target = _user(database_session, "transfer-target")
    first_trip = _create_trip(integration_client, poi_map, "Transferred one")
    _create_trip(integration_client, poi_map, "Transferred two")
    place = _create_place(integration_client, poi_map, "Transferred photo")
    _add_photo(database_session, UUID(place["id"]), poi_map.id, auth_user.id, 321)
    invitation = _ownership_invitation(database_session, poi_map, auth_user, target)
    quotas = QuotaService(database_session)

    assert quotas.usage(auth_user.id, QuotaKey.MAPS_MAX) == 1
    assert quotas.usage(auth_user.id, QuotaKey.TRIPS_TOTAL_MAX) == 2
    assert quotas.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == 321
    assert database_session.get(PoiMap, UUID(first_trip["map_id"])) is not None

    response = _accept_transfer(integration_client, target, invitation)

    assert response.status_code == 204
    database_session.expire_all()
    assert database_session.get(PoiMap, poi_map.id).owner_id == target.id
    roles = {
        item.user_id: item.role
        for item in database_session.scalars(select(MapMembership).where(MapMembership.map_id == poi_map.id))
    }
    assert roles == {auth_user.id: "editor", target.id: "owner"}
    assert quotas.usage(auth_user.id, QuotaKey.MAPS_MAX) == 0
    assert quotas.usage(auth_user.id, QuotaKey.TRIPS_TOTAL_MAX) == 0
    assert quotas.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 0
    assert quotas.usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == 0
    assert quotas.usage(target.id, QuotaKey.MAPS_MAX) == 1
    assert quotas.usage(target.id, QuotaKey.TRIPS_TOTAL_MAX) == 2
    assert quotas.usage(target.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.usage(target.id, QuotaKey.STORAGE_BYTES_MAX) == 321
    assert quotas.usage(target.id, QuotaKey.MEMBERSHIPS_TOTAL_MAX) == 1


@pytest.mark.parametrize(
    ("limit", "expected_code"),
    [
        ({"maps_max": 0}, "quota.maps.limit_reached"),
        ({"trips_total_max": 0}, "quota.trips_total.limit_reached"),
        ({"photos_total_max": 0}, "quota.photos_total.limit_reached"),
        ({"storage_bytes_max": 100}, "quota.storage_bytes.limit_reached"),
        ({"memberships_total_max": 0}, "quota.memberships_total.limit_reached"),
    ],
)
def test_ownership_transfer_rejects_saturated_destination_account_quotas_atomically(
    integration_client,
    database_session,
    auth_user,
    poi_map,
    limit,
    expected_code,
) -> None:
    profile = _profile(database_session, **{"maps_max": 10, **limit})
    target = _user(database_session, "blocked-target", profile)
    _create_trip(integration_client, poi_map, "Transferred trip")
    place = _create_place(integration_client, poi_map, "Transferred media")
    _add_photo(database_session, UUID(place["id"]), poi_map.id, auth_user.id, 200)
    invitation = _ownership_invitation(database_session, poi_map, auth_user, target)

    response = _accept_transfer(integration_client, target, invitation)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == expected_code
    _assert_transfer_unchanged(database_session, poi_map, auth_user, target)


def test_ownership_transfer_applies_destination_profile_to_existing_map_scopes(
    integration_client, database_session, auth_user, poi_map
) -> None:
    profile = _profile(database_session, maps_max=10, places_per_map_max=0)
    target = _user(database_session, "scoped-target", profile)
    _create_place(integration_client, poi_map, "Existing scoped place")
    invitation = _ownership_invitation(database_session, poi_map, auth_user, target)

    response = _accept_transfer(integration_client, target, invitation)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.places_per_map.limit_reached"
    _assert_transfer_unchanged(database_session, poi_map, auth_user, target)


def test_restore_map_rejects_saturated_map_quota_without_partial_mutation(
    integration_client, database_session, auth_user, poi_map, france_country
) -> None:
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    replacement = integration_client.post(
        "/maps", json={"country_id": str(france_country.id), "name": "Replacement map"}
    )
    assert replacement.status_code == 201
    auth_user.quota_profile_id = _profile(database_session, maps_max=1).id
    database_session.commit()
    database_session.expire_all()
    before = database_session.get(PoiMap, poi_map.id)
    deleted_at, purge_after = before.deleted_at, before.purge_after

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.maps.limit_reached"
    database_session.expire_all()
    unchanged = database_session.get(PoiMap, poi_map.id)
    assert unchanged.deleted_at == deleted_at
    assert unchanged.purge_after == purge_after


def test_restore_map_revalidates_only_reactivated_total_trips(
    integration_client, database_session, auth_user, poi_map
) -> None:
    _create_trip(integration_client, poi_map, "Trip hidden by map trash")
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(database_session, maps_max=10, trips_total_max=0).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.trips_total.limit_reached"
    database_session.expire_all()
    assert database_session.get(PoiMap, poi_map.id).deleted_at is not None


@pytest.mark.parametrize(
    ("limit", "expected_code"),
    [
        ({"places_per_map_max": 0}, "quota.places_per_map.limit_reached"),
        ({"trips_per_map_max": 0}, "quota.trips_per_map.limit_reached"),
        ({"categories_per_map_max": 0}, "quota.categories_per_map.limit_reached"),
    ],
)
def test_restore_map_revalidates_existing_map_scoped_usage(
    integration_client, database_session, auth_user, poi_map, limit, expected_code
) -> None:
    _create_place(integration_client, poi_map, "Scoped place")
    _create_trip(integration_client, poi_map, "Scoped trip")
    database_session.add(Category(map_id=poi_map.id, name="Scoped category"))
    database_session.commit()
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(database_session, maps_max=10, **limit).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == expected_code
    database_session.expire_all()
    assert database_session.get(PoiMap, poi_map.id).deleted_at is not None


def test_restore_map_rejects_multiple_quota_violations_without_partial_restore(
    integration_client, database_session, auth_user, poi_map
) -> None:
    place = _create_place(integration_client, poi_map, "Atomic place")
    trip = _create_trip(integration_client, poi_map, "Atomic trip")
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(
        database_session,
        maps_max=10,
        places_per_map_max=0,
        trips_total_max=0,
        trips_per_map_max=0,
    ).id
    database_session.commit()
    before_map = database_session.get(PoiMap, poi_map.id)
    map_state = (before_map.deleted_at, before_map.deleted_by_user_id, before_map.purge_after)
    place_state = database_session.get(Place, UUID(place["id"])).deleted_at
    trip_state = database_session.get(Trip, UUID(trip["id"])).deleted_at

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    database_session.expire_all()
    unchanged_map = database_session.get(PoiMap, poi_map.id)
    assert (unchanged_map.deleted_at, unchanged_map.deleted_by_user_id, unchanged_map.purge_after) == map_state
    assert database_session.get(Place, UUID(place["id"])).deleted_at == place_state
    assert database_session.get(Trip, UUID(trip["id"])).deleted_at == trip_state


@pytest.mark.parametrize(("limit", "expected_status"), [(1, 204), (0, 409)])
def test_restore_map_allows_exact_place_limit_and_rejects_limit_plus_one(
    integration_client, database_session, auth_user, poi_map, limit, expected_status
) -> None:
    _create_place(integration_client, poi_map, "Boundary place")
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(database_session, maps_max=10, places_per_map_max=limit).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == expected_status


def test_restore_map_ignores_individually_deleted_children_in_active_deltas(
    integration_client, database_session, auth_user, poi_map
) -> None:
    place = _create_place(integration_client, poi_map, "Already trashed place")
    trip = _create_trip(integration_client, poi_map, "Already trashed trip")
    assert integration_client.delete(f"/places/{place['id']}").status_code == 204
    assert integration_client.delete(f"/trips/{trip['id']}").status_code == 204
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(
        database_session,
        maps_max=1,
        places_per_map_max=0,
        trips_total_max=0,
        trips_per_map_max=0,
    ).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 204
    database_session.expire_all()
    assert database_session.get(Place, UUID(place["id"])).deleted_at is not None
    assert database_session.get(Trip, UUID(trip["id"])).deleted_at is not None


@pytest.mark.parametrize(
    ("limit", "expected_code"),
    [
        ({"members_per_map_max": 0}, "quota.members_per_map.limit_reached"),
        ({"memberships_total_max": 0}, "quota.memberships_total.limit_reached"),
        ({"pending_invitations_per_map_max": 0}, "quota.pending_invitations_per_map.limit_reached"),
        ({"pending_invitations_max": 0}, "quota.pending_invitations.limit_reached"),
    ],
)
def test_restore_map_revalidates_memberships_and_pending_invitations(
    integration_client, database_session, auth_user, poi_map, limit, expected_code
) -> None:
    invitee = _user(database_session, "restore-invitee")
    database_session.add(
        MapInvitation(
            map_id=poi_map.id,
            email=invitee.email,
            role="viewer",
            token_hash=uuid4().hex,
            created_by_user_id=auth_user.id,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        )
    )
    database_session.commit()
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(database_session, maps_max=10, **limit).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == expected_code


@pytest.mark.parametrize(
    ("limit", "expected_code"),
    [
        ({"photos_per_place_max": 0}, "quota.photos_per_place.limit_reached"),
        ({"links_per_place_max": 0}, "quota.links_per_place.limit_reached"),
        ({"days_per_trip_max": 0}, "quota.days_per_trip.limit_reached"),
        ({"steps_per_day_max": 0}, "quota.steps_per_day.limit_reached"),
    ],
)
def test_restore_map_revalidates_nested_scope_maxima(
    integration_client, database_session, auth_user, poi_map, limit, expected_code
) -> None:
    place = _create_place(integration_client, poi_map, "Nested place")
    _add_photo(database_session, UUID(place["id"]), poi_map.id, auth_user.id, 5)
    database_session.add(PlaceLink(place_id=UUID(place["id"]), url="https://example.test"))
    trip = _create_trip(integration_client, poi_map, "Nested trip")
    day_response = integration_client.post(f"/trips/{trip['id']}/days", json={"title": "Nested day"})
    assert day_response.status_code == 201
    stop_response = integration_client.post(
        f"/trip-days/{day_response.json()['id']}/stops",
        json={"name": "Nested stop", "latitude": 48.2, "longitude": 2.2, "stop_type": "other"},
    )
    assert stop_response.status_code == 201
    database_session.commit()
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(database_session, maps_max=10, **limit).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == expected_code


@pytest.mark.parametrize("restore_path", ["/trash/place/{id}/restore", "/places/{id}/restore"])
def test_restore_place_rejects_saturated_active_place_quota(
    integration_client, database_session, auth_user, poi_map, restore_path
) -> None:
    old = _create_place(integration_client, poi_map, "Trashed place")
    assert integration_client.delete(f"/places/{old['id']}").status_code == 204
    _create_place(integration_client, poi_map, "Replacement place")
    auth_user.quota_profile_id = _profile(database_session, places_per_map_max=1).id
    database_session.commit()

    response = integration_client.post(restore_path.format(id=old["id"]))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "quota.places_per_map.limit_reached"
    database_session.expire_all()
    assert database_session.get(PoiMap, poi_map.id) is not None
    from app.places.models import Place
    assert database_session.get(Place, UUID(old["id"])).deleted_at is not None


def test_restore_trip_rejects_saturated_trip_quotas_atomically(
    integration_client, database_session, auth_user, poi_map
) -> None:
    old = _create_trip(integration_client, poi_map, "Trashed trip")
    assert integration_client.delete(f"/trips/{old['id']}").status_code == 204
    _create_trip(integration_client, poi_map, "Replacement trip")
    auth_user.quota_profile_id = _profile(
        database_session, trips_total_max=1, trips_per_map_max=1
    ).id
    database_session.commit()
    from app.trips.models import Trip
    before = database_session.get(Trip, UUID(old["id"]))
    deleted_at, purge_after = before.deleted_at, before.purge_after

    response = integration_client.post(f"/trash/trip/{old['id']}/restore")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] in {
        "quota.trips_total.limit_reached",
        "quota.trips_per_map.limit_reached",
    }
    database_session.expire_all()
    unchanged = database_session.get(Trip, UUID(old["id"]))
    assert unchanged.deleted_at == deleted_at
    assert unchanged.purge_after == purge_after


def test_restore_place_does_not_revalidate_media_already_counted_in_trash(
    integration_client, database_session, auth_user, poi_map
) -> None:
    old = _create_place(integration_client, poi_map, "Place with retained media")
    _add_photo(database_session, UUID(old["id"]), poi_map.id, auth_user.id, 200)
    assert integration_client.delete(f"/places/{old['id']}").status_code == 204
    auth_user.quota_profile_id = _profile(
        database_session,
        places_per_map_max=1,
        photos_total_max=1,
        photos_per_place_max=1,
        storage_bytes_max=200,
    ).id
    database_session.commit()
    quotas = QuotaService(database_session)
    assert quotas.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == 200

    response = integration_client.post(f"/trash/place/{old['id']}/restore")

    assert response.status_code == 204
    assert quotas.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == 200


def test_restore_map_does_not_revalidate_media_already_counted_in_trash(
    integration_client, database_session, auth_user, poi_map
) -> None:
    place = _create_place(integration_client, poi_map, "Map media")
    _add_photo(database_session, UUID(place["id"]), poi_map.id, auth_user.id, 150)
    assert integration_client.delete(f"/maps/{poi_map.id}").status_code == 204
    auth_user.quota_profile_id = _profile(
        database_session, maps_max=1, photos_total_max=1, storage_bytes_max=150
    ).id
    database_session.commit()

    response = integration_client.post(f"/trash/map/{poi_map.id}/restore")

    assert response.status_code == 204
    quotas = QuotaService(database_session)
    assert quotas.usage(auth_user.id, QuotaKey.PHOTOS_TOTAL_MAX) == 1
    assert quotas.usage(auth_user.id, QuotaKey.STORAGE_BYTES_MAX) == 150


def test_valid_restores_finish_at_exact_active_usage(
    integration_client, database_session, auth_user, poi_map
) -> None:
    place = _create_place(integration_client, poi_map, "Valid place restore")
    trip = _create_trip(integration_client, poi_map, "Valid trip restore")
    assert integration_client.delete(f"/places/{place['id']}").status_code == 204
    assert integration_client.delete(f"/trips/{trip['id']}").status_code == 204
    auth_user.quota_profile_id = _profile(
        database_session, places_per_map_max=1, trips_total_max=1, trips_per_map_max=1
    ).id
    database_session.commit()

    assert integration_client.post(f"/trash/place/{place['id']}/restore").status_code == 204
    assert integration_client.post(f"/trash/trip/{trip['id']}/restore").status_code == 204

    quotas = QuotaService(database_session)
    assert quotas.usage(auth_user.id, QuotaKey.PLACES_PER_MAP_MAX, poi_map.id) == 1
    assert quotas.usage(auth_user.id, QuotaKey.TRIPS_PER_MAP_MAX, poi_map.id) == 1
    assert quotas.usage(auth_user.id, QuotaKey.TRIPS_TOTAL_MAX) == 1
