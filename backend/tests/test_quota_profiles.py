from uuid import uuid4

import pytest

from app.quotas.models import UNLIMITED_PROFILE_ID


pytestmark = pytest.mark.integration


def _create_profile(client, **overrides):
    payload = {
        "name": f"Quota {uuid4()}",
        "description": "Integration test profile",
        "is_active": True,
        "limits": {},
    }
    payload.update(overrides)
    return client.post("/admin/quota-profiles", json=payload)


def test_quota_profiles_require_global_administrator(
    integration_client, database_session, auth_user
) -> None:
    auth_user.is_admin = False
    database_session.flush()

    response = integration_client.get("/admin/quota-profiles")

    assert response.status_code == 403


def test_profile_lifecycle_preserves_unlimited_semantics(integration_client) -> None:
    created = _create_profile(
        integration_client,
        limits={"maps_max": 0, "places_per_map_max": 25, "storage_bytes_max": None},
    )

    assert created.status_code == 201
    profile = created.json()
    assert profile["limits"]["maps_max"] == 0
    assert profile["limits"]["places_per_map_max"] == 25
    assert profile["limits"]["storage_bytes_max"] is None

    duplicated = integration_client.post(f"/admin/quota-profiles/{profile['id']}/duplicate")
    assert duplicated.status_code == 201
    copy = duplicated.json()
    assert copy["id"] != profile["id"]
    assert copy["is_default"] is False
    assert copy["is_system"] is False
    assert copy["limits"] == profile["limits"]

    archived = integration_client.post(f"/admin/quota-profiles/{copy['id']}/archive")
    deleted = integration_client.delete(f"/admin/quota-profiles/{copy['id']}")
    assert archived.status_code == 200
    assert archived.json()["is_active"] is False
    assert deleted.status_code == 204


def test_profile_validation_rejects_negative_and_case_insensitive_duplicate_names(
    integration_client,
) -> None:
    negative = _create_profile(integration_client, limits={"maps_max": -1})
    first = _create_profile(integration_client, name=f"Standard {uuid4()}")
    duplicate = _create_profile(integration_client, name=f"  {first.json()['name'].upper()}  ")

    assert negative.status_code == 422
    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "quota.profile.name_conflict"


def test_system_unlimited_profile_cannot_be_restricted_archived_or_deleted(
    integration_client,
) -> None:
    restricted = integration_client.patch(
        f"/admin/quota-profiles/{UNLIMITED_PROFILE_ID}",
        json={"limits": {"maps_max": 1}},
    )
    deactivated = integration_client.patch(
        f"/admin/quota-profiles/{UNLIMITED_PROFILE_ID}",
        json={"is_active": False},
    )
    archived = integration_client.post(
        f"/admin/quota-profiles/{UNLIMITED_PROFILE_ID}/archive"
    )
    deleted = integration_client.delete(f"/admin/quota-profiles/{UNLIMITED_PROFILE_ID}")

    assert restricted.status_code == 409
    assert restricted.json()["detail"]["code"] == "quota.profile.system_unlimited"
    assert deactivated.status_code == 409
    assert deactivated.json()["detail"]["code"] == "quota.profile.system_protected"
    assert archived.status_code == 409
    assert deleted.status_code == 409


def test_default_change_is_atomic_and_inactive_profile_is_rejected(integration_client) -> None:
    created = _create_profile(integration_client)
    profile_id = created.json()["id"]
    selected = integration_client.post(f"/admin/quota-profiles/{profile_id}/set-default")
    profiles = integration_client.get("/admin/quota-profiles").json()

    assert selected.status_code == 200
    assert selected.json()["is_default"] is True
    assert sum(item["is_default"] for item in profiles) == 1

    inactive = _create_profile(integration_client, is_active=False)
    rejected = integration_client.post(
        f"/admin/quota-profiles/{inactive.json()['id']}/set-default"
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "quota.profile.inactive"


def test_assigned_profile_cannot_be_archived_or_deleted(
    integration_client, auth_user
) -> None:
    created = _create_profile(integration_client)
    profile_id = created.json()["id"]
    assigned = integration_client.put(
        f"/admin/users/{auth_user.id}/quota-profile",
        json={"quota_profile_id": profile_id},
    )

    archived = integration_client.post(f"/admin/quota-profiles/{profile_id}/archive")
    deleted = integration_client.delete(f"/admin/quota-profiles/{profile_id}")

    assert assigned.status_code == 200
    assert assigned.json()["profile"]["id"] == profile_id
    assert archived.status_code == 409
    assert archived.json()["detail"]["code"] == "quota.profile.assigned"
    assert deleted.status_code == 409
    assert deleted.json()["detail"]["code"] == "quota.profile.assigned"


def test_zero_map_limit_blocks_creation_but_unlimited_allows_it(
    integration_client, auth_user, france_country
) -> None:
    blocked_profile = _create_profile(integration_client, limits={"maps_max": 0}).json()
    integration_client.put(
        f"/admin/users/{auth_user.id}/quota-profile",
        json={"quota_profile_id": blocked_profile["id"]},
    )
    blocked = integration_client.post(
        "/maps", json={"country_id": str(france_country.id), "name": "Blocked map"}
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "quota.maps.limit_reached"
    assert blocked.json()["detail"]["params"]["limit"] == 0

    integration_client.put(
        f"/admin/users/{auth_user.id}/quota-profile",
        json={"quota_profile_id": str(UNLIMITED_PROFILE_ID)},
    )
    allowed = integration_client.post(
        "/maps", json={"country_id": str(france_country.id), "name": "Allowed map"}
    )
    assert allowed.status_code == 201
