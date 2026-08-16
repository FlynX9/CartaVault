from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.models import User, UserApiCredential
from app.basemaps.models import GoogleSatelliteUsageDaily
from app.basemaps.router import _record, _reserve_tile
from app.quotas.models import QuotaProfile
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


pytestmark = pytest.mark.integration


def credential_for(session: Session, user: User) -> UserApiCredential:
    credential = UserApiCredential(
        user_id=user.id,
        provider="google",
        name="Metering test",
        encrypted_secret="not-decrypted-by-these-tests",
        encryption_version=1,
        secret_last4="test",
    )
    session.add(credential)
    session.flush()
    return credential


def test_authoritative_counter_increments_only_from_server(database_session: Session, auth_user: User) -> None:
    credential = credential_for(database_session, auth_user)

    _record(database_session, auth_user, credential, {"tiles_started": 1})
    _record(database_session, auth_user, credential, {"tiles_started": 1})
    database_session.commit()

    assert QuotaService(database_session).usage(auth_user.id, QuotaKey.GOOGLE_SATELLITE_TILES_DAILY_MAX) == 2


def test_browser_telemetry_endpoint_no_longer_exists(integration_client: TestClient) -> None:
    response = integration_client.post(
        "/basemaps/google-satellite/usage",
        json={"tiles_started": 500},
    )

    assert response.status_code == 404


def test_concurrent_requests_cannot_cross_the_last_user_quota_unit(test_engine) -> None:
    profile_id = user_id = credential_id = None
    suffix = uuid4().hex
    with Session(test_engine) as setup:
        profile = QuotaProfile(
            name=f"Provider metering {suffix}",
            is_active=True,
            google_satellite_tiles_daily_max=1,
            google_satellite_tiles_monthly_max=1,
        )
        setup.add(profile)
        setup.flush()
        user = User(
            email=f"provider-meter-{suffix}@example.test",
            display_name="Provider meter",
            password_hash="test-only",
            is_active=True,
            quota_profile_id=profile.id,
        )
        setup.add(user)
        setup.flush()
        credential = credential_for(setup, user)
        setup.commit()
        profile_id, user_id, credential_id = profile.id, user.id, credential.id

    def reserve() -> int:
        with Session(test_engine) as session:
            current_user = session.get(User, user_id)
            current_credential = session.get(UserApiCredential, credential_id)
            assert current_user is not None and current_credential is not None
            try:
                _reserve_tile(session, current_user, current_credential)
                return 204
            except HTTPException as error:
                return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = sorted(executor.map(lambda _: reserve(), range(2)))
        assert results == [204, 429]
    finally:
        with Session(test_engine) as cleanup:
            cleanup.execute(delete(GoogleSatelliteUsageDaily).where(GoogleSatelliteUsageDaily.user_id == user_id))
            cleanup.execute(delete(UserApiCredential).where(UserApiCredential.id == credential_id))
            cleanup.execute(delete(User).where(User.id == user_id))
            cleanup.execute(delete(QuotaProfile).where(QuotaProfile.id == profile_id))
            cleanup.commit()
