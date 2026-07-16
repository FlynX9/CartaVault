from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.exports.temporary_exports import get as get_temporary_export
from app.main import app
from app.maps.models import MapInvitation, MapMembership, PoiMap


pytestmark = pytest.mark.integration


def _user(database_session, label: str) -> User:
    user = User(email=f"{label}-{uuid4()}@example.test", display_name=label.title(), password_hash="test-only", is_admin=False, is_active=True)
    database_session.add(user); database_session.flush()
    return user


def _map(database_session, country, owner: User, name: str) -> PoiMap:
    poi_map = PoiMap(name=name, country_id=country.id, owner_id=owner.id, is_private=True)
    database_session.add(poi_map); database_session.flush()
    database_session.add(MapMembership(map_id=poi_map.id, user_id=owner.id, role="owner")); database_session.flush()
    return poi_map


def test_role_matrix_private_visibility_and_cross_map_associations(integration_client, database_session, auth_user) -> None:
    from app.countries.models import Country
    country_a, country_b = database_session.scalars(select(Country).order_by(Country.iso_alpha3).limit(2)).all()
    assert country_a is not None and country_b is not None
    owner, editor, viewer, outsider = (_user(database_session, label) for label in ("owner", "editor", "viewer", "outsider"))
    map_a = _map(database_session, country_a, owner, "Private A")
    map_b = _map(database_session, country_b, owner, "Private B")
    database_session.add_all([MapMembership(map_id=map_a.id, user_id=editor.id, role="editor"), MapMembership(map_id=map_a.id, user_id=viewer.id, role="viewer")]); database_session.flush()

    app.dependency_overrides[get_current_user] = lambda: owner
    owner_maps = {item["id"]: item for item in integration_client.get("/maps").json()}
    assert owner_maps[str(map_a.id)]["is_shared"] is True
    assert owner_maps[str(map_b.id)]["is_shared"] is False
    place_a = integration_client.post("/places", json={"name": "Owned place", "map_id": str(map_a.id), "latitude": 48, "longitude": 2})
    place_b = integration_client.post("/places", json={"name": "Other map place", "map_id": str(map_b.id), "latitude": 49, "longitude": 3})
    assert place_a.status_code == place_b.status_code == 201
    category_a = integration_client.post("/categories", json={"map_id": str(map_a.id), "name": f"Category {uuid4()}"})
    tag_a = integration_client.post("/tags", json={"map_id": str(map_a.id), "name": f"Tag {uuid4()}"})
    assert category_a.status_code == tag_a.status_code == 201
    assert integration_client.post(f"/places/{place_b.json()['id']}/categories/{category_a.json()['id']}").status_code == 409
    assert integration_client.post(f"/places/{place_b.json()['id']}/tags/{tag_a.json()['id']}").status_code == 409

    app.dependency_overrides[get_current_user] = lambda: viewer
    assert integration_client.get(f"/maps/{map_a.id}").status_code == 200
    assert integration_client.get(f"/places/{place_a.json()['id']}").status_code == 200
    assert integration_client.patch(f"/places/{place_a.json()['id']}", json={"name": "Forbidden"}).status_code == 403
    assert integration_client.post("/categories", json={"map_id": str(map_a.id), "name": "Forbidden"}).status_code == 403
    assert integration_client.post(f"/maps/{map_a.id}/imports/kmz/preview", files={"file": ("empty.kmz", b"invalid", "application/vnd.google-earth.kmz")}).status_code == 403
    assert integration_client.get(f"/maps/{map_a.id}/members").status_code == 403
    viewer_export = integration_client.post(f"/maps/{map_a.id}/exports/kmz", json={})
    assert viewer_export.status_code == 201
    assert integration_client.get(viewer_export.json()["download_url"]).status_code == 200

    app.dependency_overrides[get_current_user] = lambda: editor
    assert integration_client.patch(f"/places/{place_a.json()['id']}", json={"name": "Edited"}).status_code == 200
    assert integration_client.delete(f"/maps/{map_a.id}").status_code == 403
    assert integration_client.get(f"/maps/{map_a.id}/members").status_code == 403

    app.dependency_overrides[get_current_user] = lambda: outsider
    assert integration_client.get(f"/maps/{map_a.id}").status_code == 404
    assert integration_client.get(f"/places/{place_a.json()['id']}").status_code == 404
    assert integration_client.get(f"/categories/{category_a.json()['id']}").status_code == 404
    assert integration_client.get(f"/tags/{tag_a.json()['id']}").status_code == 404

    item = get_temporary_export(UUID(viewer_export.json()["export_id"]), map_a.id, viewer.id)
    if item is not None: item.path.unlink(missing_ok=True)
    app.dependency_overrides[get_current_user] = lambda: auth_user


def test_owner_members_invitations_transfer_and_token_hashing(integration_client, database_session, auth_user, monkeypatch) -> None:
    from app.countries.models import Country
    country = database_session.query(Country).filter_by(iso_alpha3="BEL").one()
    owner = _user(database_session, "owner-transfer")
    next_owner = _user(database_session, "next-owner")
    poi_map = _map(database_session, country, owner, "Shared map")
    database_session.add(MapMembership(map_id=poi_map.id, user_id=next_owner.id, role="viewer")); database_session.flush()
    app.dependency_overrides[get_current_user] = lambda: owner

    assert integration_client.patch(f"/maps/{poi_map.id}/members/{owner.id}", json={"role": "viewer"}).status_code == 409
    invitation = integration_client.post(f"/maps/{poi_map.id}/invitations", json={"email": f"invited-{uuid4()}@example.test", "role": "editor"})
    assert invitation.status_code == 201
    raw_token = invitation.json()["invitation_url"].rsplit("/", 1)[-1]
    stored = database_session.execute(text("SELECT token_hash FROM map_invitations WHERE id=:id"), {"id": invitation.json()["id"]}).scalar_one()
    assert raw_token not in stored
    assert integration_client.get(f"/invitations/{raw_token}").status_code == 200

    monkeypatch.setattr("app.maps.invitation_router.hash_password", lambda password: f"invited::{password}")
    accepted = integration_client.post(f"/invitations/{raw_token}/accept", json={"display_name": "Invited", "password": "a sufficiently long password"})
    assert accepted.status_code == 200
    assert integration_client.post(f"/invitations/{raw_token}/accept", json={}, headers={"X-CSRF-Token": accepted.json()["csrf_token"]}).status_code == 404
    integration_client.cookies.clear()

    transferred = integration_client.post(f"/maps/{poi_map.id}/transfer-ownership", json={"new_owner_user_id": str(next_owner.id)})
    assert transferred.status_code == 200
    database_session.refresh(poi_map)
    roles = {membership.user_id: membership.role for membership in database_session.query(MapMembership).filter_by(map_id=poi_map.id)}
    assert poi_map.owner_id == next_owner.id
    assert roles[next_owner.id] == "owner"
    assert roles[owner.id] == "editor"
    assert list(roles.values()).count("owner") == 1
    app.dependency_overrides[get_current_user] = lambda: auth_user


def test_connected_user_can_accept_or_decline_a_pending_invitation(
    integration_client,
    database_session,
    auth_user,
) -> None:
    from app.countries.models import Country

    country = database_session.query(Country).filter_by(iso_alpha3="BEL").one()
    owner = _user(database_session, "invitation-owner")
    invited = _user(database_session, "invitation-target")
    other_target = _user(database_session, "invitation-decline")
    outsider = _user(database_session, "invitation-outsider")
    poi_map = _map(database_session, country, owner, "Invitation popup map")

    try:
        app.dependency_overrides[get_current_user] = lambda: owner
        accepted_invitation = integration_client.post(
            f"/maps/{poi_map.id}/invitations",
            json={"email": invited.email.upper(), "role": "editor"},
        )
        declined_invitation = integration_client.post(
            f"/maps/{poi_map.id}/invitations",
            json={"email": other_target.email, "role": "viewer"},
        )
        assert accepted_invitation.status_code == declined_invitation.status_code == 201

        accepted_invitation_id = accepted_invitation.json()["id"]
        declined_invitation_id = declined_invitation.json()["id"]

        app.dependency_overrides[get_current_user] = lambda: outsider
        assert integration_client.get("/invitations/pending").json() == []
        assert integration_client.post(f"/invitations/pending/{accepted_invitation_id}/accept").status_code == 404

        app.dependency_overrides[get_current_user] = lambda: invited
        pending = integration_client.get("/invitations/pending")
        assert pending.status_code == 200
        assert pending.json() == [
            {
                "id": accepted_invitation_id,
                "map_id": str(poi_map.id),
                "map_name": poi_map.name,
                "role": "editor",
                "invited_by_display_name": owner.display_name,
                "created_at": accepted_invitation.json()["created_at"],
                "expires_at": accepted_invitation.json()["expires_at"],
            }
        ]
        assert integration_client.post(f"/invitations/pending/{accepted_invitation_id}/accept").status_code == 204
        assert integration_client.get("/invitations/pending").json() == []
        membership = database_session.scalar(
            select(MapMembership).where(
                MapMembership.map_id == poi_map.id,
                MapMembership.user_id == invited.id,
            )
        )
        assert membership is not None and membership.role == "editor"

        app.dependency_overrides[get_current_user] = lambda: owner
        assert integration_client.delete(f"/maps/{poi_map.id}/members/{invited.id}").status_code == 204
        app.dependency_overrides[get_current_user] = lambda: invited
        assert integration_client.get("/maps").json() == []
        assert integration_client.get(f"/maps/{poi_map.id}").status_code == 404

        app.dependency_overrides[get_current_user] = lambda: other_target
        assert len(integration_client.get("/invitations/pending").json()) == 1
        assert integration_client.post(f"/invitations/pending/{declined_invitation_id}/decline").status_code == 204
        assert integration_client.get("/invitations/pending").json() == []
        declined = database_session.get(MapInvitation, UUID(declined_invitation_id))
        assert declined is not None and declined.revoked_at is not None
        assert database_session.scalar(
            select(MapMembership).where(
                MapMembership.map_id == poi_map.id,
                MapMembership.user_id == other_target.id,
            )
        ) is None
    finally:
        app.dependency_overrides[get_current_user] = lambda: auth_user
