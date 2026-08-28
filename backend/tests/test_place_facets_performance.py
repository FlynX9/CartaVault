from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import event

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.categories.models import Category
from app.main import app
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.statuses.service import create_default_statuses
from app.tags.models import Tag
from app.trips.models import Trip, TripDay, TripStop


pytestmark = pytest.mark.integration


def _user(session, name: str) -> User:
    user = User(
        email=f"place-facets-{uuid4()}@example.test",
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


def _place(session, poi_map, *, name, status, region, danger, condition, favorite, coordinates=True):
    place = Place(
        name=name,
        description=f"Description {name}",
        map_id=poi_map.id,
        status_id=status.id,
        region=region,
        danger_level=danger,
        condition=condition,
        is_favorite=favorite,
        interest_rating=4,
        visit_rating=4,
        location="SRID=4326;POINT(2 48)" if coordinates else None,
    )
    session.add(place)
    session.flush()
    return place


def test_text_facets_preserve_all_counts_and_self_excluding_quick_counts(
    integration_client,
    database_session,
    auth_user,
    poi_map,
):
    planning = poi_map.statuses[0]
    visited = PlaceStatus(
        map_id=poi_map.id,
        name="Visited facet",
        slug=f"visited-{uuid4().hex}",
        functional_state="visited",
        color="#2563EB",
        sort_order=10,
    )
    category_a = Category(map_id=poi_map.id, name="Alpha facet", icon="tabler:alpha")
    category_b = Category(map_id=poi_map.id, name="Beta facet", icon="tabler:beta")
    tag_a = Tag(map_id=poi_map.id, name="Alpha tag", color="#0FA68A")
    tag_b = Tag(map_id=poi_map.id, name="Beta tag", color="#2563EB")
    database_session.add_all((visited, category_a, category_b, tag_a, tag_b))
    database_session.flush()

    first = _place(
        database_session,
        poi_map,
        name="Needle alpha",
        status=planning,
        region="North",
        danger="low",
        condition="good",
        favorite=True,
    )
    second = _place(
        database_session,
        poi_map,
        name="Needle beta",
        status=visited,
        region="South",
        danger="high",
        condition="fair",
        favorite=False,
        coordinates=False,
    )
    third = _place(
        database_session,
        poi_map,
        name="Other place",
        status=planning,
        region="West",
        danger="none",
        condition="poor",
        favorite=True,
    )
    first.categories.append(category_a)
    first.tags.append(tag_a)
    second.categories.append(category_b)
    second.tags.append(tag_b)
    database_session.add(Photo(
        place_id=first.id,
        map_id=poi_map.id,
        storage_scope_id=first.id,
        filename="needle.jpg",
        path=f"{first.id}/needle.jpg",
        sort_order=0,
    ))
    trip = Trip(map_id=poi_map.id, created_by_user_id=auth_user.id, name="Facet trip")
    database_session.add(trip)
    database_session.flush()
    day = TripDay(trip_id=trip.id, day_number=1, sort_order=0)
    database_session.add(day)
    database_session.flush()
    database_session.add(TripStop(
        trip_day_id=day.id,
        place_id=second.id,
        stop_type="place",
        name=second.name,
        latitude=48,
        longitude=2,
        sort_order=0,
    ))
    database_session.commit()

    response = integration_client.get("/places/facets", params={"map_id": str(poi_map.id), "q": "Needle"})
    assert response.status_code == 200
    facets = response.json()
    assert facets["total"] == 2
    assert facets["non_visited"] == 1
    assert facets["visited"] == 1
    assert facets["favorites"] == 1
    assert [(item["name"], item["count"]) for item in facets["categories"]] == [
        ("Alpha facet", 1),
        ("Beta facet", 1),
    ]
    assert [(item["name"], item["count"]) for item in facets["tags"]] == [
        ("Alpha tag", 1),
        ("Beta tag", 1),
    ]
    assert {item["name"]: item["count"] for item in facets["statuses"]} == {
        planning.name: 1,
        visited.name: 1,
    }
    assert [(item["value"], item["count"]) for item in facets["regions"]] == [("North", 1), ("South", 1)]
    assert [(item["value"], item["count"]) for item in facets["danger_levels"]] == [("high", 1), ("low", 1)]
    assert [(item["value"], item["count"]) for item in facets["condition_values"]] == [("fair", 1), ("good", 1)]
    assert facets["with_photos"] == facets["without_photos"] == 1
    assert facets["with_coordinates"] == facets["without_coordinates"] == 1
    assert facets["in_trip"] == facets["not_in_trip"] == 1

    favorite = integration_client.get(
        "/places/facets",
        params={"map_id": str(poi_map.id), "q": "Needle", "is_favorite": "true"},
    ).json()
    assert favorite["total"] == 2
    assert favorite["favorites"] == 1
    assert sum(item["count"] for item in favorite["statuses"]) == 1

    selected_state = integration_client.get(
        "/places/facets",
        params={"map_id": str(poi_map.id), "q": "Needle", "functional_state": "visited"},
    ).json()
    assert selected_state["total"] == 2
    assert selected_state["non_visited"] == selected_state["visited"] == 1
    assert [(item["name"], item["count"]) for item in selected_state["statuses"]] == [(visited.name, 1)]

    combined = integration_client.get(
        "/places/facets",
        params={
            "map_id": str(poi_map.id),
            "q": "Needle",
            "category_ids": str(category_a.id),
            "regions": "North",
            "has_photos": "true",
        },
    ).json()
    assert combined["total"] == 1
    assert combined["with_photos"] == 1
    assert combined["regions"][0]["value"] == "North"
    assert third.id not in {first.id, second.id}


def test_text_facets_keep_acl_and_query_count_bounded(
    integration_client,
    database_session,
    auth_user,
    poi_map,
):
    editor = _user(database_session, "Facet editor")
    viewer = _user(database_session, "Facet viewer")
    outsider = _user(database_session, "Facet outsider")
    hidden_map = _map(database_session, poi_map.country_id, outsider, "Hidden facets")
    database_session.add_all((
        MapMembership(map_id=poi_map.id, user_id=editor.id, role="editor"),
        MapMembership(map_id=poi_map.id, user_id=viewer.id, role="viewer"),
    ))
    visible = _place(
        database_session,
        poi_map,
        name="Scope needle",
        status=poi_map.statuses[0],
        region="Visible",
        danger="low",
        condition="good",
        favorite=False,
    )
    hidden = _place(
        database_session,
        hidden_map,
        name="Scope needle hidden",
        status=hidden_map.statuses[0],
        region="Hidden",
        danger="high",
        condition="poor",
        favorite=False,
    )
    deleted = _place(
        database_session,
        poi_map,
        name="Scope needle deleted",
        status=poi_map.statuses[0],
        region="Deleted",
        danger="high",
        condition="poor",
        favorite=False,
    )
    deleted.deleted_at = datetime(2026, 1, 1)
    database_session.commit()

    def request_for(user: User):
        statements: list[str] = []

        def record(_connection, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        app.dependency_overrides[get_current_user] = lambda: user
        event.listen(database_session.bind, "before_cursor_execute", record)
        try:
            response = integration_client.get(
                "/places/facets",
                params={"map_id": str(poi_map.id), "q": "Scope needle"},
            )
        finally:
            event.remove(database_session.bind, "before_cursor_execute", record)
        return response, statements

    for member in (auth_user, editor, viewer):
        response, statements = request_for(member)
        assert response.status_code == 200
        assert response.json()["total"] == 1
        business_queries = [statement for statement in statements if "facet_quick_scope" in statement]
        assert len(business_queries) == 1

    forbidden, _statements = request_for(outsider)
    assert forbidden.status_code == 404
    assert hidden.id != visible.id != deleted.id
