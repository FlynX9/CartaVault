from __future__ import annotations

from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.models import RegistrationRequest, User, UserSession
from app.auth.rate_limit import PublicAuthRateLimiter
from app.auth.security import hash_token
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.statuses.service import create_default_statuses


pytestmark = pytest.mark.integration


def _user(database_session: Session, label: str) -> User:
    user = User(
        email=f"security-{label}-{uuid4()}@example.test",
        display_name=f"Security {label}",
        password_hash="security-test-password-hash",
        is_active=True,
    )
    database_session.add(user)
    database_session.flush()
    return user


def _map(database_session: Session, *, owner: User, country_id, name: str) -> PoiMap:
    poi_map = PoiMap(
        name=name,
        country_id=country_id,
        owner_id=owner.id,
        is_private=True,
    )
    database_session.add(poi_map)
    database_session.flush()
    database_session.add(
        MapMembership(map_id=poi_map.id, user_id=owner.id, role="owner")
    )
    create_default_statuses(database_session, poi_map.id)
    database_session.flush()
    return poi_map


def _use_user(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (20, 20), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def test_private_resources_and_mutations_are_scoped_to_map_membership(
    integration_client: TestClient,
    database_session: Session,
    france_country,
) -> None:
    """Known UUIDs must not bypass private-map membership or editor RBAC."""

    owner_a = _user(database_session, "owner-a")
    owner_b = _user(database_session, "owner-b")
    editor = _user(database_session, "editor")
    viewer = _user(database_session, "viewer")
    outsider = _user(database_session, "outsider")
    map_a = _map(
        database_session,
        owner=owner_a,
        country_id=france_country.id,
        name=f"Private A {uuid4()}",
    )
    map_b = _map(
        database_session,
        owner=owner_b,
        country_id=france_country.id,
        name=f"Private B {uuid4()}",
    )
    database_session.add_all(
        [
            MapMembership(map_id=map_a.id, user_id=editor.id, role="editor"),
            MapMembership(map_id=map_a.id, user_id=viewer.id, role="viewer"),
        ]
    )
    database_session.flush()

    _use_user(owner_a)
    place_response = integration_client.post(
        "/places",
        json={
            "name": "Private place",
            "map_id": str(map_a.id),
            "latitude": 48.8566,
            "longitude": 2.3522,
        },
    )
    assert place_response.status_code == 201
    place_id = place_response.json()["id"]
    upload_response = integration_client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": ("private.png", _png_bytes(), "image/png")},
    )
    assert upload_response.status_code == 201
    photo_id = upload_response.json()["id"]
    trip_response = integration_client.post(
        f"/maps/{map_a.id}/trips",
        json={"name": "Private trip"},
    )
    assert trip_response.status_code == 201
    trip_id = trip_response.json()["id"]

    # A separate owner cannot read another owner's private map by UUID.
    _use_user(owner_b)
    assert integration_client.get(f"/maps/{map_a.id}").status_code == 404

    # A user with no membership cannot enumerate or fetch resources by UUID.
    _use_user(outsider)
    assert integration_client.get(f"/maps/{map_a.id}").status_code == 404
    assert integration_client.get(f"/places/{place_id}").status_code == 404
    assert integration_client.get(f"/photos/{photo_id}").status_code == 404
    assert integration_client.get(f"/photos/{photo_id}/file").status_code == 404
    assert integration_client.get(f"/media/{photo_id}").status_code == 404
    assert integration_client.get(f"/media/{photo_id}/download").status_code == 404
    assert integration_client.get(f"/trips/{trip_id}").status_code == 404

    # Viewers can read shared resources but cannot mutate any of them.
    _use_user(viewer)
    assert integration_client.get(f"/maps/{map_a.id}").status_code == 200
    assert integration_client.get(f"/places/{place_id}").status_code == 200
    assert integration_client.get(f"/photos/{photo_id}").status_code == 200
    assert integration_client.get(f"/trips/{trip_id}").status_code == 200
    assert integration_client.patch(
        f"/places/{place_id}", json={"name": "Viewer mutation"}
    ).status_code == 403
    assert integration_client.patch(
        f"/photos/{photo_id}", json={"description": "Viewer mutation"}
    ).status_code == 403
    assert integration_client.patch(
        f"/trips/{trip_id}", json={"name": "Viewer mutation"}
    ).status_code == 403

    # Editors can update content, but cannot promote themselves or administer users.
    _use_user(editor)
    assert integration_client.patch(
        f"/maps/{map_a.id}/members/{editor.id}", json={"role": "owner"}
    ).status_code == 422
    assert integration_client.post(
        f"/maps/{map_a.id}/transfer-ownership",
        json={"new_owner_user_id": str(editor.id)},
    ).status_code == 403
    assert integration_client.get("/admin/users").status_code == 403

    # Map B's private POIs remain isolated from owner A as well.
    _use_user(owner_b)
    foreign_place = integration_client.post(
        "/places",
        json={
            "name": "Foreign place",
            "map_id": str(map_b.id),
            "latitude": 45.7640,
            "longitude": 4.8357,
        },
    )
    assert foreign_place.status_code == 201
    _use_user(owner_a)
    assert integration_client.get(
        f"/places/{foreign_place.json()['id']}"
    ).status_code == 404

    _use_user(owner_a)
    assert integration_client.delete(f"/photos/{photo_id}").status_code == 204


def test_global_administrator_has_no_implicit_access_to_private_maps(
    integration_client: TestClient,
    database_session: Session,
    france_country,
) -> None:
    administrator = _user(database_session, "administrator")
    administrator.is_admin = True
    owner = _user(database_session, "private-owner")
    private_map = _map(
        database_session,
        owner=owner,
        country_id=france_country.id,
        name=f"Administrator must not see {uuid4()}",
    )

    _use_user(owner)
    place = integration_client.post(
        "/places",
        json={
            "name": "Administrator secret place",
            "map_id": str(private_map.id),
            "latitude": 48.8566,
            "longitude": 2.3522,
        },
    )
    assert place.status_code == 201
    place_id = place.json()["id"]
    trip = integration_client.post(
        f"/maps/{private_map.id}/trips",
        json={"name": "Administrator secret trip"},
    )
    assert trip.status_code == 201

    _use_user(administrator)
    assert integration_client.get("/admin/users").status_code == 200
    assert all(
        item["id"] != str(private_map.id)
        for item in integration_client.get("/maps").json()
    )
    assert integration_client.get(f"/maps/{private_map.id}").status_code == 404
    assert integration_client.get(f"/places/{place_id}").status_code == 404
    assert integration_client.get(f"/trips/{trip.json()['id']}").status_code == 404
    assert integration_client.patch(
        f"/places/{place_id}",
        json={"name": "Forbidden administrator mutation"},
    ).status_code == 404
    assert integration_client.get(
        "/places",
        params={"map_id": str(private_map.id)},
    ).json() == []
    dashboard = integration_client.get("/dashboard").json()
    assert dashboard["summary"]["maps"] == 0
    assert dashboard["summary"]["places"] == 0

    _use_user(owner)
    assert integration_client.delete(f"/places/{place_id}").status_code == 204
    _use_user(administrator)
    assert all(item["id"] != place_id for item in integration_client.get("/trash").json())
    assert integration_client.post(f"/trash/place/{place_id}/restore").status_code == 404


def test_login_is_rate_limited_and_sessions_are_csrf_protected_and_revocable(
    integration_client: TestClient,
    database_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user(database_session, "session")
    monkeypatch.setattr(
        "app.auth.router.verify_password",
        lambda stored, password: (stored == "security-test-password-hash" and password == "correct password", False),
    )
    monkeypatch.setattr(
        "app.auth.router.public_auth_rate_limiter",
        PublicAuthRateLimiter(limit=3, window_seconds=3600),
    )

    login = integration_client.post(
        "/auth/login",
        json={"email": user.email, "password": "correct password"},
    )
    assert login.status_code == 200
    csrf_token = login.json()["csrf_token"]
    cookie_headers = "\n".join(login.headers.get_list("set-cookie"))
    assert "HttpOnly" in cookie_headers
    assert "SameSite=lax" in cookie_headers
    assert "password_hash" not in login.json()

    assert integration_client.post("/auth/logout").status_code == 403
    assert integration_client.post(
        "/auth/logout", headers={"X-CSRF-Token": csrf_token}
    ).status_code == 204
    assert integration_client.get("/auth/me").status_code == 401

    # Login throttling is evaluated before credentials are checked.
    monkeypatch.setattr(
        "app.auth.router.public_auth_rate_limiter",
        PublicAuthRateLimiter(limit=2, window_seconds=3600),
    )
    for _ in range(2):
        assert integration_client.post(
            "/auth/login",
            json={"email": user.email, "password": "wrong password"},
        ).status_code == 401
    assert integration_client.post(
        "/auth/login",
        json={"email": user.email, "password": "correct password"},
    ).status_code == 429

    expired = UserSession(
        user_id=user.id,
        token_hash=hash_token("expired-session"),
        csrf_token_hash=hash_token("expired-csrf"),
        expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1),
        last_used_at=datetime.now(UTC).replace(tzinfo=None),
    )
    database_session.add(expired)
    database_session.flush()
    integration_client.cookies.set("cartavault_session", "expired-session")
    integration_client.cookies.set("cartavault_csrf", "expired-csrf")
    assert integration_client.get("/auth/me").status_code == 401


def test_registration_response_does_not_enumerate_existing_accounts(
    integration_client: TestClient,
    database_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = _user(database_session, "registration-existing")
    pending_email = f"registration-pending-{uuid4()}@example.test"
    database_session.add(
        RegistrationRequest(
            email=pending_email,
            display_name="Pending registration",
            password_hash="pending-password-hash",
            locale="fr",
        )
    )
    database_session.commit()
    hash_calls: list[str] = []
    monkeypatch.setattr(
        "app.auth.public_router.hash_password",
        lambda password: hash_calls.append(password) or "test-password-hash",
    )
    monkeypatch.setattr(
        "app.auth.public_router.public_auth_rate_limiter",
        PublicAuthRateLimiter(limit=10, window_seconds=3600),
    )

    def register(email: str) -> object:
        return integration_client.post(
            "/auth/register",
            json={
                "email": email,
                "password": "a sufficiently long password",
                "confirmation": "a sufficiently long password",
                "locale": "fr",
            },
        )

    unseen_email = f"registration-unseen-{uuid4()}@example.test"
    existing_response = register(existing.email)
    pending_response = register(pending_email)
    unseen_response = register(unseen_email)

    assert [response.status_code for response in (existing_response, pending_response, unseen_response)] == [202, 202, 202]
    assert existing_response.json() == pending_response.json() == unseen_response.json()
    assert hash_calls == ["a sufficiently long password"] * 3
    assert database_session.scalar(
        select(RegistrationRequest).where(RegistrationRequest.email == unseen_email)
    ) is not None


def test_password_change_rotates_the_current_session(
    integration_client: TestClient,
    database_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user(database_session, "password-rotation")
    monkeypatch.setattr(
        "app.auth.router.verify_password",
        lambda stored, password: (password == "current password", False),
    )
    monkeypatch.setattr("app.auth.router.hash_password", lambda password: f"hash::{password}")

    login = integration_client.post(
        "/auth/login",
        json={"email": user.email, "password": "current password"},
    )
    assert login.status_code == 200
    old_session_token = integration_client.cookies.get("cartavault_session")
    assert old_session_token is not None

    changed = integration_client.post(
        "/auth/change-password",
        headers={"X-CSRF-Token": login.json()["csrf_token"]},
        json={"current_password": "current password", "new_password": "a new sufficiently long password"},
    )
    assert changed.status_code == 204
    assert integration_client.cookies.get("cartavault_session") != old_session_token
    assert integration_client.get("/auth/me").status_code == 200

    database_session.expire_all()
    sessions = database_session.scalars(
        select(UserSession).where(UserSession.user_id == user.id)
    ).all()
    assert len([item for item in sessions if item.revoked_at is None]) == 1
    assert database_session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(old_session_token))
    ).revoked_at is not None
