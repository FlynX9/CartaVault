from __future__ import annotations

from sqlalchemy import and_, distinct, exists, func, or_, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.countries.models import Country
from app.dashboard.schemas import (
    DashboardActivityItem,
    DashboardAttention,
    DashboardMapPoint,
    DashboardNamedCount,
    DashboardRead,
    DashboardRecentPlace,
    DashboardRecentTrip,
    DashboardStatusItem,
    DashboardSummary,
)
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place, PlaceHistory
from app.statuses.models import PlaceStatus
from app.trips.models import Trip, TripDay


def _accessible_map_ids(user: User):
    if user.is_admin:
        return select(PoiMap.id).where(PoiMap.deleted_at.is_(None))
    return (
        select(MapMembership.map_id)
        .join(PoiMap, PoiMap.id == MapMembership.map_id)
        .where(MapMembership.user_id == user.id, PoiMap.deleted_at.is_(None))
    )


def build_dashboard(session: Session, user: User) -> DashboardRead:
    map_ids = _accessible_map_ids(user)
    active_places = and_(Place.map_id.in_(map_ids), Place.deleted_at.is_(None))

    place_totals = session.execute(
        select(
            func.count(Place.id),
            func.count(Place.id).filter(PlaceStatus.functional_state == "visited"),
            func.count(Place.id).filter(PlaceStatus.functional_state == "non_visited"),
            func.count(Place.id).filter(Place.is_favorite.is_(True)),
        )
        .join(PlaceStatus, Place.status_id == PlaceStatus.id)
        .where(active_places)
    ).one()
    map_totals = session.execute(
        select(func.count(PoiMap.id), func.count(distinct(PoiMap.country_id)))
        .where(PoiMap.id.in_(map_ids), PoiMap.deleted_at.is_(None))
    ).one()
    trip_totals = session.execute(
        select(
            func.count(Trip.id),
            func.count(Trip.id).filter(Trip.status.in_(("draft", "planned", "in_progress"))),
            func.count(Trip.id).filter(Trip.status == "completed"),
        ).where(Trip.map_id.in_(map_ids), Trip.archived_at.is_(None), Trip.deleted_at.is_(None))
    ).one()
    photo_total = session.scalar(
        select(func.count(Photo.id))
        .join(Place, Photo.place_id == Place.id)
        .where(active_places)
    ) or 0
    without_photos = session.scalar(
        select(func.count(Place.id)).where(
            active_places,
            ~exists(select(Photo.id).where(Photo.place_id == Place.id)),
        )
    ) or 0

    statuses = [
        DashboardStatusItem(name=row.name, color=row.color, count=row.count)
        for row in session.execute(
            select(
                PlaceStatus.name,
                PlaceStatus.color,
                func.count(Place.id).label("count"),
                func.min(PlaceStatus.sort_order).label("first_sort_order"),
            )
            .join(Place, Place.status_id == PlaceStatus.id)
            .where(active_places)
            .group_by(PlaceStatus.name, PlaceStatus.color)
            .order_by("first_sort_order", PlaceStatus.name, PlaceStatus.color)
        )
    ]
    top_countries = [
        DashboardNamedCount(name=row.name, country_code=row.code, count=row.count)
        for row in session.execute(
            select(Country.name, Country.iso_alpha2.label("code"), func.count(Place.id).label("count"))
            .join(PoiMap, PoiMap.country_id == Country.id)
            .join(Place, Place.map_id == PoiMap.id)
            .where(active_places)
            .group_by(Country.id, Country.name, Country.iso_alpha2)
            .order_by(func.count(Place.id).desc(), Country.name)
            .limit(6)
        )
    ]
    top_categories = [
        DashboardNamedCount(name=row.name, icon=row.icon, count=row.count)
        for row in session.execute(
            select(Category.name, Category.icon, func.count(distinct(Place.id)).label("count"))
            .join(place_categories_table, place_categories_table.c.category_id == Category.id)
            .join(Place, Place.id == place_categories_table.c.place_id)
            .where(active_places)
            .group_by(Category.name, Category.icon)
            .order_by(func.count(distinct(Place.id)).desc(), Category.name, Category.icon)
            .limit(6)
        )
    ]

    primary_photo_id = (
        select(Photo.id)
        .where(Photo.place_id == Place.id)
        .order_by(Photo.is_primary.desc(), Photo.sort_order, Photo.id)
        .limit(1)
        .scalar_subquery()
    )
    recent_places = [
        DashboardRecentPlace(
            id=row.id, map_id=row.map_id, map_name=row.map_name, name=row.name,
            country_name=row.country_name, country_code=row.country_code, region=row.region,
            status_name=row.status_name, status_color=row.status_color,
            is_favorite=row.is_favorite, primary_photo_id=row.primary_photo_id,
            updated_at=row.updated_at,
        )
        for row in session.execute(
            select(
                Place.id, Place.map_id, PoiMap.name.label("map_name"), Place.name, Place.region,
                Country.name.label("country_name"), Country.iso_alpha2.label("country_code"),
                PlaceStatus.name.label("status_name"), PlaceStatus.color.label("status_color"),
                Place.is_favorite, primary_photo_id.label("primary_photo_id"),
                Place.updated_at,
            )
            .join(PoiMap, Place.map_id == PoiMap.id)
            .join(Country, PoiMap.country_id == Country.id)
            .join(PlaceStatus, Place.status_id == PlaceStatus.id)
            .where(active_places)
            .order_by(Place.updated_at.desc(), Place.id)
            .limit(6)
        )
    ]
    trip_day_metrics = (
        select(
            TripDay.trip_id.label("trip_id"),
            func.count(TripDay.id).label("day_count"),
            func.coalesce(func.sum(TripDay.route_distance_meters), 0).label("route_distance_meters"),
            func.coalesce(func.sum(TripDay.route_duration_seconds), 0).label("route_duration_seconds"),
        )
        .group_by(TripDay.trip_id)
        .subquery()
    )
    recent_trips = [
        DashboardRecentTrip(
            id=row.id, map_id=row.map_id, map_name=row.map_name, name=row.name,
            status=row.status, start_date=row.start_date, end_date=row.end_date,
            day_count=row.day_count, route_distance_meters=float(row.route_distance_meters),
            route_duration_seconds=float(row.route_duration_seconds), updated_at=row.updated_at,
        )
        for row in session.execute(
            select(
                Trip.id, Trip.map_id, PoiMap.name.label("map_name"), Trip.name, Trip.status,
                Trip.start_date, Trip.end_date,
                func.coalesce(trip_day_metrics.c.day_count, 0).label("day_count"),
                func.coalesce(trip_day_metrics.c.route_distance_meters, 0).label("route_distance_meters"),
                func.coalesce(trip_day_metrics.c.route_duration_seconds, 0).label("route_duration_seconds"),
                Trip.updated_at,
            )
            .join(PoiMap, Trip.map_id == PoiMap.id)
            .outerjoin(trip_day_metrics, trip_day_metrics.c.trip_id == Trip.id)
            .where(Trip.map_id.in_(map_ids), Trip.archived_at.is_(None), Trip.deleted_at.is_(None))
            .order_by(Trip.updated_at.desc(), Trip.id)
            .limit(6)
        )
    ]

    without_categories = session.scalar(
        select(func.count(Place.id)).where(
            active_places,
            ~exists(select(place_categories_table.c.place_id).where(place_categories_table.c.place_id == Place.id)),
        )
    ) or 0
    without_coordinates = session.scalar(
        select(func.count(Place.id)).where(active_places, Place.location.is_(None))
    ) or 0
    without_region = session.scalar(
        select(func.count(Place.id)).where(
            active_places,
            or_(Place.region.is_(None), func.btrim(Place.region) == ""),
        )
    ) or 0
    duplicate_groups = (
        select(
            Place.map_id.label("map_id"),
            func.lower(func.btrim(Place.name)).label("normalized_name"),
            func.count(Place.id).label("item_count"),
        )
        .where(active_places)
        .group_by(Place.map_id, func.lower(func.btrim(Place.name)))
        .having(func.count(Place.id) > 1)
        .subquery()
    )
    possible_duplicates = session.scalar(
        select(func.coalesce(func.sum(duplicate_groups.c.item_count - 1), 0))
    ) or 0
    stale_routes = session.scalar(
        select(func.count(TripDay.id))
        .join(Trip, TripDay.trip_id == Trip.id)
        .where(
            Trip.map_id.in_(map_ids),
            Trip.archived_at.is_(None),
            Trip.deleted_at.is_(None),
            TripDay.route_status.in_(("stale", "failed")),
        )
    ) or 0
    incomplete_maps = session.scalar(
        select(func.count(PoiMap.id)).where(
            PoiMap.id.in_(map_ids),
            PoiMap.deleted_at.is_(None),
            or_(
                PoiMap.center_latitude.is_(None),
                PoiMap.center_longitude.is_(None),
                PoiMap.default_zoom.is_(None),
            ),
        )
    ) or 0

    latitude_bucket = func.floor(func.ST_Y(Place.location) * 10) / 10.0
    longitude_bucket = func.floor(func.ST_X(Place.location) * 10) / 10.0
    coordinate_rows = session.execute(
        select(
            latitude_bucket.label("latitude"),
            longitude_bucket.label("longitude"),
            func.count(Place.id).label("count"),
        )
        .where(active_places, Place.location.is_not(None))
        .group_by(latitude_bucket, longitude_bucket)
        .order_by(func.count(Place.id).desc())
        .limit(300)
    )
    map_points = [
        DashboardMapPoint(latitude=float(row.latitude), longitude=float(row.longitude), count=row.count)
        for row in coordinate_rows
    ]
    activity = [
        DashboardActivityItem(
            id=row.id, place_id=row.place_id, place_name=row.place_name,
            action=row.action, created_at=row.created_at,
        )
        for row in session.execute(
            select(
                PlaceHistory.id, PlaceHistory.place_id, Place.name.label("place_name"),
                PlaceHistory.action, PlaceHistory.created_at,
            )
            .join(Place, PlaceHistory.place_id == Place.id)
            .where(active_places)
            .order_by(PlaceHistory.created_at.desc(), PlaceHistory.id)
            .limit(8)
        )
    ]

    return DashboardRead(
        summary=DashboardSummary(
            places=place_totals[0], maps=map_totals[0], countries=map_totals[1], trips=trip_totals[0],
            visited_places=place_totals[1], unvisited_places=place_totals[2],
            favorites=place_totals[3], media=photo_total, places_without_photos=without_photos,
            planned_trips=trip_totals[1], completed_trips=trip_totals[2],
        ),
        statuses=statuses,
        top_countries=top_countries,
        top_categories=top_categories,
        recent_places=recent_places,
        recent_trips=recent_trips,
        attention=DashboardAttention(
            without_photos=without_photos, without_categories=without_categories,
            without_coordinates=without_coordinates, without_region=without_region,
            possible_duplicates=possible_duplicates, stale_routes=stale_routes,
            incomplete_map_metadata=incomplete_maps,
        ),
        map_points=map_points,
        activity=activity,
    )
