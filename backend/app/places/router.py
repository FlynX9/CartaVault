from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.categories.models import Category
from app.categories.associations import place_categories_table
from app.categories.schemas import CategoryRead
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_place_role
from app.database import get_db
from app.countries.schemas import CountrySummary
from app.maps.models import PoiMap
from app.maps.models import MapMembership
from app.maps.schemas import MapSummary
from app.places.filters import MapBounds, get_map_bounds
from app.places.filtering import PlaceFilters, apply_place_filters, get_place_filters, place_ordering
from app.places.models import Place
from app.places.fields import normalize_place_field_config
from app.places.history import add_place_history, changed_values
from app.places.schemas import PlaceBulkAction, PlaceBulkResult, PlaceBulkTripAction, PlaceBulkTripResult, PlaceCategoryRead, PlaceCreate, PlaceFacets, PlaceFacetItem, PlaceListPosition, PlaceRead, PlaceUpdate
from app.tags.models import Tag
from app.tags.schemas import TagRead
from app.statuses.models import PlaceStatus
from app.statuses.schemas import PlaceStatusSummary
from app.tags.associations import place_tags_table
from app.trips.models import TripDay, TripStop
from app.trips.permissions import require_trip_editor
from app.trips.service import stale


router = APIRouter(
    prefix="/places",
    tags=["places"],
)


def build_place_read_statement():
    """Build the common query used to expose places through the API."""

    return (
        select(
            Place,
            func.ST_X(Place.location).label("longitude"),
            func.ST_Y(Place.location).label("latitude"),
        )
        .options(
            joinedload(Place.map).joinedload(PoiMap.country),
            joinedload(Place.status),
            selectinload(Place.categories),
            selectinload(Place.tags),
            selectinload(Place.photos),
            selectinload(Place.links),
        )
    )


def place_to_read(
    place: Place,
    longitude: float | None,
    latitude: float | None,
    database_session: Session,
) -> PlaceRead:
    """Convert a SQLAlchemy place and its coordinates to an API schema."""

    return PlaceRead(
        id=place.id,
        name=place.name,
        map_id=place.map_id,
        map=MapSummary(
            id=place.map.id,
            name=place.map.name,
            country=CountrySummary(
                id=place.map.country.id,
                iso_alpha2=place.map.country.iso_alpha2,
                iso_alpha3=place.map.country.iso_alpha3,
                name=place.map.country.name,
            ),
        ),
        status=PlaceStatusSummary(
            id=place.status.id,
            name=place.status.name,
            slug=place.status.slug,
            color=place.status.color,
            is_active=place.status.is_active,
        ),
        description=place.description,
        region=place.region,
        construction_date=place.construction_date,
        abandonment_date=place.abandonment_date,
        condition=place.condition,
        access=place.access,
        danger_level=place.danger_level,
        custom_fields=place.custom_fields,
        longitude=longitude,
        latitude=latitude,
        categories=[
            PlaceCategoryRead(
                id=category.id,
                map_id=category.map_id,
                name=category.name,
                description=category.description,
                icon=category.icon,
                marks_as_visited=category.marks_as_visited,
                is_primary=bool(database_session.scalar(select(place_categories_table.c.is_primary).where(place_categories_table.c.place_id == place.id, place_categories_table.c.category_id == category.id))),
            )
            for category in place.categories
        ],
        tags=[
            TagRead(
                id=tag.id,
                map_id=tag.map_id,
                name=tag.name,
            )
            for tag in place.tags
        ],
        created_at=place.created_at,
        updated_at=place.updated_at,
        is_favorite=place.is_favorite,
        interest_rating=place.interest_rating,
        visit_rating=place.visit_rating,
        is_visited=any(category.marks_as_visited for category in place.categories),
        deleted_at=place.deleted_at,
        links=place.links,
        field_config=normalize_place_field_config(place.map.place_field_config),
        primary_photo_id=next((photo.id for photo in place.photos if photo.is_primary), place.photos[0].id if place.photos else None),
    )


def read_place(
    database_session: Session,
    place_id: UUID,
) -> PlaceRead:
    """Read one place after a create, update or relationship change."""

    statement = build_place_read_statement().where(
        Place.id == place_id,
        Place.deleted_at.is_(None),
    )

    row = database_session.execute(statement).one()

    place, longitude, latitude = row

    return place_to_read(
        place=place,
        longitude=longitude,
        latitude=latitude,
        database_session=database_session,
    )


@router.get(
    "",
    response_model=list[PlaceRead],
)
def get_places(
    map_id: UUID | None = Query(
        default=None,
        description="Filter places by map UUID",
    ),
    region: str | None = Query(default=None, min_length=1, max_length=100, deprecated=True),
    category_id: UUID | None = Query(default=None, deprecated=True),
    tag_id: UUID | None = Query(default=None, deprecated=True),
    status_id: UUID | None = Query(default=None, deprecated=True),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description="Maximum number of places returned",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of places to skip",
    ),
    map_bounds: MapBounds | None = Depends(get_map_bounds),
    filters: PlaceFilters = Depends(get_place_filters),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PlaceRead]:
    """Return places using optional search, filters and pagination."""

    statement = build_place_read_statement()
    if not current_user.is_admin:
        statement = statement.where(
            Place.map_id.in_(select(MapMembership.map_id).where(MapMembership.user_id == current_user.id))
        )

    if map_id is not None:
        statement = statement.where(Place.map_id == map_id)
    statement = apply_place_filters(statement, filters)
    if region is not None: statement = statement.where(func.lower(Place.region) == region.strip().lower())
    if category_id is not None: statement = statement.where(Place.categories.any(Category.id == category_id))
    if tag_id is not None: statement = statement.where(Place.tags.any(Tag.id == tag_id))
    if status_id is not None: statement = statement.where(Place.status_id == status_id)

    if map_bounds is not None:
        visible_area = func.ST_MakeEnvelope(
            map_bounds.min_longitude,
            map_bounds.min_latitude,
            map_bounds.max_longitude,
            map_bounds.max_latitude,
            4326,
        )

        statement = statement.where(
            func.ST_Intersects(
                Place.location,
                visible_area,
            )
        )

    statement = (
        statement
        .order_by(*place_ordering(filters))
        .offset(offset)
        .limit(limit)
    )

    rows = database_session.execute(statement).all()

    return [
        place_to_read(
            place=place,
            longitude=longitude,
            latitude=latitude,
            database_session=database_session,
        )
        for place, longitude, latitude in rows
    ]


@router.post("/bulk", response_model=PlaceBulkResult)
def bulk_update_places(
    action_data: PlaceBulkAction,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceBulkResult:
    """Apply one validated action atomically to an explicit, bounded selection."""
    places = database_session.scalars(
        select(Place).where(Place.id.in_(action_data.place_ids), Place.deleted_at.is_(None)).options(
            selectinload(Place.categories), selectinload(Place.tags),
        )
    ).all()
    if len(places) != len(action_data.place_ids):
        raise HTTPException(status_code=404, detail="BULK_PLACE_NOT_FOUND")

    map_ids = {place.map_id for place in places}
    if len(map_ids) != 1:
        raise HTTPException(status_code=409, detail="BULK_PLACE_FORBIDDEN")
    for selected_map_id in map_ids:
        require_map_role(database_session, selected_map_id, current_user, "editor")

    target_category = None
    target_tag = None
    target_status = None
    if action_data.category_id is not None:
        target_category = database_session.get(Category, action_data.category_id)
        if target_category is None or target_category.map_id not in map_ids:
            raise HTTPException(status_code=409, detail="BULK_CATEGORY_FORBIDDEN")
    if action_data.tag_id is not None:
        target_tag = database_session.get(Tag, action_data.tag_id)
        if target_tag is None or target_tag.map_id not in map_ids:
            raise HTTPException(status_code=409, detail="BULK_TAG_FORBIDDEN")
    if action_data.status_id is not None:
        target_status = database_session.get(PlaceStatus, action_data.status_id)
        if target_status is None or not target_status.is_active:
            raise HTTPException(status_code=409, detail="BULK_STATUS_FORBIDDEN")

    updated_count = 0
    unchanged_count = 0
    try:
        for place in places:
            if action_data.action == "delete":
                place.deleted_at = func.now()
                place.deleted_by_user_id = current_user.id
                add_place_history(database_session, place.id, current_user.id, "trashed", {})
                continue
            if action_data.action == "set_status" and target_status is not None:
                if place.status_id == target_status.id: unchanged_count += 1
                else: place.status_id = target_status.id; updated_count += 1
            elif action_data.action == "add_category" and target_category is not None:
                if target_category in place.categories: unchanged_count += 1
                else:
                    place.categories.append(target_category); database_session.flush()
                    if len(place.categories) == 1:
                        database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place.id, place_categories_table.c.category_id == target_category.id).values(is_primary=True))
                    updated_count += 1
            elif action_data.action == "remove_category" and target_category is not None:
                if target_category not in place.categories: unchanged_count += 1
                else: place.categories.remove(target_category); updated_count += 1
            elif action_data.action == "add_tag" and target_tag is not None:
                if target_tag in place.tags: unchanged_count += 1
                else: place.tags.append(target_tag); updated_count += 1
            elif action_data.action == "remove_tag" and target_tag is not None:
                if target_tag not in place.tags: unchanged_count += 1
                else: place.tags.remove(target_tag); updated_count += 1
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="BULK_ACTION_FAILED") from error

    return PlaceBulkResult(selected_count=len(places), updated_count=updated_count, unchanged_count=unchanged_count, deleted_count=len(places) if action_data.action == "delete" else 0)


@router.post("/bulk/add-to-trip", response_model=PlaceBulkTripResult)
def bulk_add_to_trip(
    action_data: PlaceBulkTripAction,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceBulkTripResult:
    """Append selected same-map POIs to one editable trip day atomically."""
    places = database_session.scalars(select(Place).where(Place.id.in_(action_data.place_ids))).all()
    if len(places) != len(action_data.place_ids):
        raise HTTPException(status_code=404, detail="BULK_PLACE_NOT_FOUND")
    map_ids = {place.map_id for place in places}
    if len(map_ids) != 1:
        raise HTTPException(status_code=409, detail="BULK_PLACE_FORBIDDEN")
    trip_access = require_trip_editor(database_session, action_data.trip_id, current_user)
    day = database_session.get(TripDay, action_data.day_id)
    if day is None or day.trip_id != trip_access.trip.id:
        raise HTTPException(status_code=409, detail="BULK_DAY_FORBIDDEN")
    if trip_access.trip.map_id not in map_ids:
        raise HTTPException(status_code=409, detail="BULK_TRIP_FORBIDDEN")
    existing = set(database_session.scalars(select(TripStop.place_id).where(TripStop.trip_day_id == day.id, TripStop.place_id.in_(action_data.place_ids))).all())
    next_order = (database_session.scalar(select(func.max(TripStop.sort_order)).where(TripStop.trip_day_id == day.id)) or -1) + 1
    added = 0
    try:
        for place in places:
            if place.id in existing:
                continue
            longitude = database_session.scalar(select(func.ST_X(Place.location)).where(Place.id == place.id))
            latitude = database_session.scalar(select(func.ST_Y(Place.location)).where(Place.id == place.id))
            if longitude is None or latitude is None:
                raise HTTPException(status_code=409, detail="BULK_PLACE_FORBIDDEN")
            database_session.add(TripStop(trip_day_id=day.id, place_id=place.id, stop_type="place", name=place.name, latitude=latitude, longitude=longitude, sort_order=next_order, visit_duration_minutes=30))
            next_order += 1; added += 1
        stale(day)
        database_session.commit()
    except HTTPException:
        database_session.rollback()
        raise
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="BULK_ACTION_FAILED") from error
    return PlaceBulkTripResult(selected_count=len(places), added_count=added, duplicate_count=len(places) - added)


@router.get("/facets", response_model=PlaceFacets)
def get_place_facets(
    map_id: UUID,
    filters: PlaceFilters = Depends(get_place_filters),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceFacets:
    """Return map-scoped filter counters without loading POIs into Python."""
    require_map_role(database_session, map_id, current_user, "viewer")
    base = apply_place_filters(select(Place.id).where(Place.map_id == map_id), filters).subquery()
    ids = select(base.c.id)
    def total(predicate): return int(database_session.scalar(select(func.count()).select_from(Place).where(Place.id.in_(ids), predicate)) or 0)
    categories = [PlaceFacetItem(id=row.id, name=row.name, icon=row.icon, count=row.count) for row in database_session.execute(select(Category.id, Category.name, Category.icon, func.count(func.distinct(place_categories_table.c.place_id)).label("count")).join(place_categories_table, Category.id == place_categories_table.c.category_id).where(place_categories_table.c.place_id.in_(ids)).group_by(Category.id, Category.name, Category.icon).order_by(Category.name)).all()]
    tags = [PlaceFacetItem(id=row.id, name=row.name, count=row.count) for row in database_session.execute(select(Tag.id, Tag.name, func.count(func.distinct(place_tags_table.c.place_id)).label("count")).join(place_tags_table, Tag.id == place_tags_table.c.tag_id).where(place_tags_table.c.place_id.in_(ids)).group_by(Tag.id, Tag.name).order_by(Tag.name)).all()]
    statuses = [PlaceFacetItem(id=row.id, name=row.name, color=row.color, count=row.count) for row in database_session.execute(select(PlaceStatus.id, PlaceStatus.name, PlaceStatus.color, func.count(Place.id).label("count")).join(Place, Place.status_id == PlaceStatus.id).where(Place.id.in_(ids), PlaceStatus.is_active.is_(True)).group_by(PlaceStatus.id, PlaceStatus.name, PlaceStatus.color).order_by(PlaceStatus.sort_order, PlaceStatus.name)).all()]
    regions = [PlaceFacetItem(value=row.value, count=row.count) for row in database_session.execute(select(Place.region.label("value"), func.count(Place.id).label("count")).where(Place.id.in_(ids), Place.region.is_not(None), Place.region != "").group_by(Place.region).order_by(Place.region)).all()]

    def value_facets(column: object) -> list[PlaceFacetItem]:
        rows = database_session.execute(
            select(column.label("value"), func.count(Place.id).label("count"))
            .where(Place.id.in_(ids), column.is_not(None), column != "")
            .group_by(column)
            .order_by(column)
        ).all()
        return [PlaceFacetItem(value=row.value, count=row.count) for row in rows]

    return PlaceFacets(
        categories=categories,
        tags=tags,
        statuses=statuses,
        regions=regions,
        access_values=value_facets(Place.access),
        danger_levels=value_facets(Place.danger_level),
        condition_values=value_facets(Place.condition),
        with_photos=total(Place.photos.any()),
        without_photos=total(~Place.photos.any()),
        with_coordinates=total(Place.location.is_not(None)),
        without_coordinates=total(Place.location.is_(None)),
        in_trip=total(Place.trip_stops.any()),
        not_in_trip=total(~Place.trip_stops.any()),
    )


@router.get("/{place_id}/list-position", response_model=PlaceListPosition)
def get_place_list_position(
    place_id: UUID,
    map_id: UUID,
    page_size: int = Query(default=100, ge=1, le=100),
    filters: PlaceFilters = Depends(get_place_filters),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceListPosition:
    """Locate one accessible place in the same filtered, stable list as GET /places."""
    require_map_role(database_session, map_id, current_user, "viewer")
    place = database_session.get(Place, place_id)
    if place is None or place.map_id != map_id:
        raise HTTPException(status_code=404, detail="PLACE_NOT_ACCESSIBLE")

    ranked = apply_place_filters(
        select(
            Place.id.label("place_id"),
            (func.row_number().over(order_by=place_ordering(filters)) - 1).label("position"),
        ).where(Place.map_id == map_id),
        filters,
    ).subquery()
    position = database_session.scalar(
        select(ranked.c.position).where(ranked.c.place_id == place_id)
    )
    if position is None:
        return PlaceListPosition(
            place_id=place_id,
            matches_filters=False,
            page_size=page_size,
        )
    index = int(position)
    return PlaceListPosition(
        place_id=place_id,
        matches_filters=True,
        index=index,
        page=index // page_size,
        page_size=page_size,
    )


@router.get(
    "/{place_id}",
    response_model=PlaceRead,
)
def get_place(
    place_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceRead:
    """Return one place by its UUID."""

    require_place_role(database_session, place_id, current_user, "viewer")
    statement = build_place_read_statement().where(
        Place.id == place_id,
        Place.deleted_at.is_(None),
    )

    row = database_session.execute(statement).one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    place, longitude, latitude = row

    return place_to_read(
        place=place,
        longitude=longitude,
        latitude=latitude,
        database_session=database_session,
    )


@router.post(
    "",
    response_model=PlaceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_place(
    place_data: PlaceCreate,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceRead:
    """Create a new point of interest."""

    require_map_role(database_session, place_data.map_id, current_user, "editor")

    if place_data.status_id is None:
        place_status = database_session.scalar(
            select(PlaceStatus).where(PlaceStatus.is_default.is_(True))
        )
        if place_status is None:
            raise HTTPException(status_code=409, detail="No default place status is configured")
    else:
        place_status = database_session.get(PlaceStatus, place_data.status_id)
        if place_status is None:
            raise HTTPException(
                status_code=404,
                detail=f"Status with id {place_data.status_id} was not found",
            )
        if not place_status.is_active:
            raise HTTPException(status_code=409, detail="An inactive status cannot be selected")

    location = WKTElement(
        f"POINT({place_data.longitude} {place_data.latitude})",
        srid=4326,
    )

    place = Place(
        name=place_data.name,
        map_id=place_data.map_id,
        status_id=place_status.id,
        description=place_data.description,
        location=location,
        region=place_data.region,
        construction_date=place_data.construction_date,
        abandonment_date=place_data.abandonment_date,
        condition=place_data.condition,
        access=place_data.access,
        danger_level=place_data.danger_level,
        is_favorite=place_data.is_favorite,
        interest_rating=place_data.interest_rating,
        visit_rating=place_data.visit_rating,
    )

    try:
        database_session.add(place)
        database_session.flush()
        add_place_history(database_session, place.id, current_user.id, "created", {"name": {"old": None, "new": place.name}})
        database_session.commit()
        database_session.refresh(place)

        return read_place(
            database_session=database_session,
            place_id=place.id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the place",
        ) from error


@router.patch(
    "/{place_id}",
    response_model=PlaceRead,
)
def update_place(
    place_id: UUID,
    place_data: PlaceUpdate,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceRead:
    """Partially update an existing place."""

    place = require_place_role(database_session, place_id, current_user, "editor")

    supplied_data = place_data.model_dump(exclude_unset=True)
    audited_fields = {"name", "map_id", "status_id", "description", "region", "construction_date", "abandonment_date", "condition", "access", "danger_level", "is_favorite", "interest_rating", "visit_rating"}
    before = {field: getattr(place, field) for field in audited_fields}

    requested_map_id = supplied_data.get("map_id")
    if requested_map_id is not None:
        require_map_role(database_session, requested_map_id, current_user, "editor")
        if requested_map_id != place.map_id and (place.categories or place.tags):
            raise HTTPException(status_code=409, detail="Remove map-scoped categories and tags before moving the place")

    requested_status_id = supplied_data.get("status_id")
    if requested_status_id is not None:
        requested_status = database_session.get(PlaceStatus, requested_status_id)
        if requested_status is None:
            raise HTTPException(
                status_code=404,
                detail=f"Status with id {requested_status_id} was not found",
            )
        if not requested_status.is_active:
            raise HTTPException(status_code=409, detail="An inactive status cannot be selected")

    latitude = supplied_data.pop("latitude", None)
    longitude = supplied_data.pop("longitude", None)

    for field_name, field_value in supplied_data.items():
        setattr(place, field_name, field_value)

    if latitude is not None and longitude is not None:
        place.location = WKTElement(
            f"POINT({longitude} {latitude})",
            srid=4326,
        )

    changes = changed_values(before, {field: getattr(place, field) for field in audited_fields})
    if latitude is not None and longitude is not None:
        changes["coordinates"] = {"old": None, "new": {"latitude": latitude, "longitude": longitude}}

    try:
        if changes:
            add_place_history(database_session, place.id, current_user.id, "updated", changes)
        database_session.commit()
        database_session.refresh(place)

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the place",
        ) from error


@router.delete(
    "/{place_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_place(
    place_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Move an existing place to the trash."""

    place = require_place_role(database_session, place_id, current_user, "editor")

    try:
        place.deleted_at = func.now()
        place.deleted_by_user_id = current_user.id
        add_place_history(database_session, place.id, current_user.id, "trashed", {})
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the place",
        ) from error


@router.post(
    "/{place_id}/categories/{category_id}",
    response_model=PlaceRead,
)
def add_category_to_place(
    place_id: UUID,
    category_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceRead:
    """Assign a category to a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.categories),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    require_map_role(database_session, place.map_id, current_user, "editor")
    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    if category.map_id != place.map_id:
        raise HTTPException(status_code=409, detail="Category and place must belong to the same map")

    if category not in place.categories:
        place.categories.append(category)
        add_place_history(database_session, place.id, current_user.id, "category_added", {"category_id": {"old": None, "new": str(category.id)}})
        database_session.flush()
        if database_session.scalar(select(func.count()).select_from(place_categories_table).where(place_categories_table.c.place_id == place_id)) == 1:
            database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id).values(is_primary=True))

    try:
        database_session.commit()

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to assign the category to the place",
        ) from error


@router.delete(
    "/{place_id}/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_category_from_place(
    place_id: UUID,
    category_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Remove a category from a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.categories),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    require_map_role(database_session, place.map_id, current_user, "editor")
    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    if category in place.categories:
        add_place_history(database_session, place.id, current_user.id, "category_removed", {"category_id": {"old": str(category.id), "new": None}})
        was_primary = database_session.scalar(select(place_categories_table.c.is_primary).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id))
        place.categories.remove(category)
        database_session.flush()
        if was_primary:
            replacement = database_session.scalar(select(place_categories_table.c.category_id).where(place_categories_table.c.place_id == place_id).order_by(place_categories_table.c.category_id).limit(1))
            if replacement is not None:
                database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == replacement).values(is_primary=True))

    try:
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to remove the category from the place",
        ) from error


@router.post(
    "/{place_id}/tags/{tag_id}",
    response_model=PlaceRead,
)
def add_tag_to_place(
    place_id: UUID,
    tag_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceRead:
    """Assign a tag to a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.tags),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    require_map_role(database_session, place.map_id, current_user, "editor")
    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    if tag.map_id != place.map_id:
        raise HTTPException(status_code=409, detail="Tag and place must belong to the same map")

    if tag not in place.tags:
        place.tags.append(tag)
        add_place_history(database_session, place.id, current_user.id, "tag_added", {"tag_id": {"old": None, "new": str(tag.id)}})

    try:
        database_session.commit()

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to assign the tag to the place",
        ) from error


@router.patch("/{place_id}/categories/{category_id}", response_model=PlaceRead)
def set_primary_category(place_id: UUID, category_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceRead:
    """Atomically select an already-associated primary category."""
    place = require_place_role(database_session, place_id, current_user, "editor")
    category = database_session.get(Category, category_id)
    if category is None or category.map_id != place.map_id:
        raise HTTPException(status_code=404, detail=f"Category with id {category_id} was not found")
    if database_session.scalar(select(place_categories_table.c.category_id).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id)) is None:
        raise HTTPException(status_code=404, detail="Category is not assigned to the place")
    try:
        database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id).values(is_primary=False))
        database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id).values(is_primary=True))
        add_place_history(database_session, place.id, current_user.id, "primary_category_changed", {"category_id": {"old": None, "new": str(category_id)}})
        database_session.commit()
        return read_place(database_session, place_id)
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the primary category") from error


@router.delete(
    "/{place_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_tag_from_place(
    place_id: UUID,
    tag_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Remove a tag from a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.tags),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    require_map_role(database_session, place.map_id, current_user, "editor")
    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    if tag in place.tags:
        place.tags.remove(tag)
        add_place_history(database_session, place.id, current_user.id, "tag_removed", {"tag_id": {"old": str(tag.id), "new": None}})

    try:
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to remove the tag from the place",
        ) from error
