from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import event

from app.auth.models import User
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.statuses.service import create_default_statuses


pytestmark = pytest.mark.integration


def _user(session, name: str) -> User:
    user = User(
        email=f"media-listing-{uuid4()}@example.test",
        display_name=name,
        password_hash="test-only",
        is_active=True,
    )
    session.add(user)
    session.flush()
    return user


def _map(session, country_id, owner: User, name: str) -> PoiMap:
    poi_map = PoiMap(name=name, country_id=country_id, owner_id=owner.id, is_private=True)
    session.add(poi_map)
    session.flush()
    session.add(MapMembership(map_id=poi_map.id, user_id=owner.id, role="owner"))
    create_default_statuses(session, poi_map.id)
    session.flush()
    return poi_map


def _place(session, poi_map: PoiMap, name: str, *, deleted_at=None) -> Place:
    place = Place(
        name=name,
        map_id=poi_map.id,
        status_id=poi_map.statuses[0].id,
        location="SRID=4326;POINT(2 48)",
        deleted_at=deleted_at,
    )
    session.add(place)
    session.flush()
    return place


def _photo(
    session,
    *,
    name: str,
    uploader: User,
    created_at: datetime,
    place: Place | None = None,
    poi_map: PoiMap | None = None,
    mime_type: str = "image/jpeg",
    size: int = 100,
    state: str = "healthy",
    primary: bool = False,
) -> Photo:
    photo_id = uuid4()
    photo = Photo(
        id=photo_id,
        place_id=place.id if place else None,
        map_id=poi_map.id if poi_map else None,
        storage_scope_id=None if state == "missing" else uuid4(),
        filename=name,
        original_name=name,
        description=f"Description {name}",
        path=None if state == "missing" else f"private/{photo_id}/{name}",
        mime_type=mime_type,
        file_size_bytes=size,
        width=1600 if state == "healthy" else None,
        height=1200 if state == "healthy" else None,
        uploaded_by_user_id=uploader.id,
        sort_order=0,
        is_primary=primary,
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(photo)
    session.flush()
    return photo


def test_media_listing_preserves_filters_options_aggregates_acl_and_pagination(
    integration_client,
    database_session,
    auth_user,
    poi_map,
):
    other = _user(database_session, "Beta uploader")
    forbidden_owner = _user(database_session, "Forbidden uploader")
    member_map = _map(database_session, poi_map.country_id, other, "Member map")
    forbidden_map = _map(database_session, poi_map.country_id, forbidden_owner, "Forbidden map")
    database_session.add(MapMembership(map_id=member_map.id, user_id=auth_user.id, role="viewer"))
    database_session.flush()

    start = datetime(2026, 1, 1)
    own_place = _place(database_session, poi_map, "Needle museum")
    missing_place = _place(database_session, poi_map, "Missing place")
    error_place = _place(database_session, poi_map, "Error place")
    member_place = _place(database_session, member_map, "Member place")
    forbidden_place = _place(database_session, forbidden_map, "Forbidden place")
    deleted_place = _place(database_session, poi_map, "Deleted place", deleted_at=start)

    own = _photo(
        database_session,
        name="needle.jpg",
        uploader=auth_user,
        created_at=start,
        place=own_place,
        poi_map=poi_map,
        size=100,
        primary=True,
    )
    missing = _photo(
        database_session,
        name="missing.png",
        uploader=auth_user,
        created_at=start + timedelta(days=1),
        place=missing_place,
        poi_map=poi_map,
        mime_type="image/png",
        size=200,
        state="missing",
        primary=True,
    )
    error = _photo(
        database_session,
        name="error.webp",
        uploader=auth_user,
        created_at=start + timedelta(days=2),
        place=error_place,
        poi_map=poi_map,
        mime_type="image/webp",
        size=300,
        state="error",
        primary=True,
    )
    map_orphan = _photo(
        database_session,
        name="map-orphan.jpg",
        uploader=other,
        created_at=start + timedelta(days=3),
        poi_map=poi_map,
        size=400,
    )
    global_orphan = _photo(
        database_session,
        name="global-orphan.png",
        uploader=auth_user,
        created_at=start + timedelta(days=4),
        mime_type="image/png",
        size=500,
    )
    member = _photo(
        database_session,
        name="member.jpg",
        uploader=other,
        created_at=start + timedelta(days=5),
        place=member_place,
        poi_map=member_map,
        size=600,
        primary=True,
    )
    forbidden = _photo(
        database_session,
        name="forbidden.jpg",
        uploader=forbidden_owner,
        created_at=start + timedelta(days=6),
        place=forbidden_place,
        poi_map=poi_map,
        size=700,
        primary=True,
    )
    deleted = _photo(
        database_session,
        name="deleted.jpg",
        uploader=auth_user,
        created_at=start + timedelta(days=7),
        place=deleted_place,
        poi_map=poi_map,
        size=800,
        primary=True,
    )
    database_session.commit()

    response = integration_client.get("/media", params={"page_size": 100})
    assert response.status_code == 200
    payload = response.json()
    expected_ids = {str(item.id) for item in (own, missing, error, map_orphan, global_orphan, member)}
    assert {item["id"] for item in payload["items"]} == expected_ids
    assert str(forbidden.id) not in {item["id"] for item in payload["items"]}
    assert str(deleted.id) not in {item["id"] for item in payload["items"]}
    assert [item["id"] for item in payload["items"]] == [
        str(member.id),
        str(global_orphan.id),
        str(map_orphan.id),
        str(error.id),
        str(missing.id),
        str(own.id),
    ]
    assert payload["total"] == 6
    assert payload["aggregates"] == {
        "total_count": 6,
        "total_size_bytes": 2100,
        "primary_count": 4,
        "missing_count": 1,
        "error_count": 1,
    }
    assert [item["name"] for item in payload["filters"]["maps"]] == ["France", "Member map"]
    assert payload["filters"]["formats"] == ["JPEG", "PNG", "WEBP"]
    assert [item["name"] for item in payload["filters"]["uploaders"]] == ["Beta uploader", "Test owner"]

    assert integration_client.get("/media", params={"map_id": str(poi_map.id), "page_size": 100}).json()["total"] == 4
    assert integration_client.get("/media", params={"uploader_id": str(other.id), "page_size": 100}).json()["total"] == 2
    assert integration_client.get("/media", params={"format": "png", "page_size": 100}).json()["total"] == 2
    assert integration_client.get("/media", params={"file_state": "healthy", "page_size": 100}).json()["total"] == 4
    assert integration_client.get("/media", params={"q": "Needle", "page_size": 100}).json()["items"][0]["id"] == str(own.id)

    first_page = integration_client.get("/media", params={"page": 1, "page_size": 2}).json()
    second_page = integration_client.get("/media", params={"page": 2, "page_size": 2}).json()
    assert first_page["pages"] == 3
    assert first_page["total"] == second_page["total"] == 6
    assert {item["id"] for item in first_page["items"]}.isdisjoint(
        {item["id"] for item in second_page["items"]}
    )

    member_item = next(item for item in payload["items"] if item["id"] == str(member.id))
    global_item = next(item for item in payload["items"] if item["id"] == str(global_orphan.id))
    assert member_item["can_edit"] is False
    assert global_item["map"] is None
    assert global_item["can_edit"] is True


def test_media_listing_query_count_does_not_scale_with_items(
    integration_client,
    database_session,
    auth_user,
):
    def add_global_orphans(count: int) -> None:
        database_session.add_all([
            Photo(
                storage_scope_id=uuid4(),
                filename=f"scaling-{uuid4()}.jpg",
                original_name="Scaling media",
                path=f"private/{uuid4()}/scaling.jpg",
                mime_type="image/jpeg",
                file_size_bytes=100,
                width=100,
                height=100,
                uploaded_by_user_id=auth_user.id,
            )
            for _ in range(count)
        ])
        database_session.flush()

    def listing_query_count() -> int:
        statements: list[str] = []

        def record(_connection, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        event.listen(database_session.bind, "before_cursor_execute", record)
        try:
            response = integration_client.get("/media", params={"page_size": 100})
            assert response.status_code == 200
        finally:
            event.remove(database_session.bind, "before_cursor_execute", record)
        return len(statements)

    add_global_orphans(10)
    small_count = listing_query_count()
    add_global_orphans(110)
    large_count = listing_query_count()

    assert small_count <= 4
    assert large_count <= small_count + 1
