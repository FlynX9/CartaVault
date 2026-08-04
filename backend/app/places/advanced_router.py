"""Links, audit trail, and trash lifecycle for places."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_place_role
from app.database import get_db
from app.places.history import add_place_history
from app.places.models import Place, PlaceHistory, PlaceLink
from app.places.router import build_place_read_statement, get_primary_category_keys, place_to_read
from app.places.schemas import PlaceHistoryPage, PlaceHistoryRead, PlaceLinkCreate, PlaceLinkRead, PlaceLinksReplace, PlaceLinkUpdate, PlaceRead
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService

router = APIRouter(prefix="/places", tags=["places advanced"])
MAX_LINKS_PER_PLACE = 20


def _link_read(link: PlaceLink) -> PlaceLinkRead:
    return PlaceLinkRead.model_validate(link, from_attributes=True)


def _ensure_unique_link_url(
    database_session: Session,
    place_id: UUID,
    url: str,
    *,
    excluding_link_id: UUID | None = None,
) -> None:
    statement = select(PlaceLink.id).where(PlaceLink.place_id == place_id, PlaceLink.url == url)
    if excluding_link_id is not None:
        statement = statement.where(PlaceLink.id != excluding_link_id)
    if database_session.scalar(statement.limit(1)) is not None:
        raise HTTPException(status_code=409, detail="This URL is already attached to the place")


@router.get("/trash", response_model=list[PlaceRead])
def list_trashed_places(map_id: UUID = Query(), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceRead]:
    require_map_role(database_session, map_id, current_user, "editor")
    rows = database_session.execute(build_place_read_statement().where(Place.map_id == map_id, Place.deleted_at.is_not(None)).order_by(Place.deleted_at.desc(), Place.id)).all()
    primary_categories = get_primary_category_keys(
        database_session,
        [place.id for place, _, _ in rows],
    )
    return [
        place_to_read(place, longitude, latitude, database_session, primary_categories)
        for place, longitude, latitude in rows
    ]


@router.post("/{place_id}/restore", response_model=PlaceRead)
def restore_place(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceRead:
    place = require_place_role(database_session, place_id, current_user, "editor", include_deleted=True)
    if place.deleted_at is None:
        raise HTTPException(status_code=409, detail="The place is not in the trash")
    place.deleted_at = None
    place.deleted_by_user_id = None
    place.purge_after = None
    add_place_history(database_session, place.id, current_user.id, "restored", {})
    database_session.commit()
    place, longitude, latitude = database_session.execute(build_place_read_statement().where(Place.id == place_id)).one()
    return place_to_read(
        place,
        longitude,
        latitude,
        database_session,
        get_primary_category_keys(database_session, [place.id]),
    )


@router.delete("/{place_id}/permanent", status_code=204)
def permanently_delete_place(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    place = require_place_role(database_session, place_id, current_user, "editor", include_deleted=True)
    if place.deleted_at is None:
        raise HTTPException(status_code=409, detail="Move the place to the trash before permanent deletion")
    if place.trip_stops or place.trip_nights:
        raise HTTPException(status_code=409, detail="Remove this place from every trip before permanent deletion")
    database_session.delete(place)
    database_session.commit()
    return Response(status_code=204)


@router.get("/{place_id}/links", response_model=list[PlaceLinkRead])
def get_place_links(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceLinkRead]:
    place = require_place_role(database_session, place_id, current_user, "viewer")
    return [_link_read(link) for link in sorted(place.links, key=lambda item: (item.sort_order, item.id))]


@router.post("/{place_id}/links", response_model=PlaceLinkRead, status_code=201)
def create_place_link(place_id: UUID, data: PlaceLinkCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceLinkRead:
    place = require_place_role(database_session, place_id, current_user, "editor")
    QuotaService(database_session).ensure_can_create(current_user.id, QuotaKey.LINKS_PER_PLACE_MAX, scope_id=place_id)
    if database_session.scalar(select(func.count()).select_from(PlaceLink).where(PlaceLink.place_id == place_id)) >= MAX_LINKS_PER_PLACE:
        raise HTTPException(status_code=409, detail=f"A place cannot have more than {MAX_LINKS_PER_PLACE} links")
    _ensure_unique_link_url(database_session, place_id, data.url)
    link = PlaceLink(place_id=place_id, **data.model_dump())
    database_session.add(link)
    database_session.flush()
    add_place_history(database_session, place.id, current_user.id, "link_added", {"link": {"old": None, "new": {"id": str(link.id), "url": link.url, "label": link.label}}})
    database_session.commit()
    database_session.refresh(link)
    return _link_read(link)


@router.patch("/{place_id}/links/{link_id}", response_model=PlaceLinkRead)
def update_place_link(place_id: UUID, link_id: UUID, data: PlaceLinkUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceLinkRead:
    place = require_place_role(database_session, place_id, current_user, "editor")
    link = database_session.scalar(select(PlaceLink).where(PlaceLink.id == link_id, PlaceLink.place_id == place_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    if data.url is not None:
        _ensure_unique_link_url(database_session, place_id, data.url, excluding_link_id=link.id)
    before = {"url": link.url, "label": link.label, "sort_order": link.sort_order}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    after = {"url": link.url, "label": link.label, "sort_order": link.sort_order}
    add_place_history(database_session, place.id, current_user.id, "link_updated", {"link": {"old": before, "new": after}})
    database_session.commit()
    database_session.refresh(link)
    return _link_read(link)


@router.put("/{place_id}/links", response_model=list[PlaceLinkRead])
def replace_place_links(place_id: UUID, data: PlaceLinksReplace, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceLinkRead]:
    """Replace a place link collection atomically while preserving its row order."""

    place = require_place_role(database_session, place_id, current_user, "editor")
    existing = {link.id: link for link in place.links}
    requested_ids = {item.id for item in data.links if item.id is not None}
    unknown_ids = requested_ids.difference(existing)
    if unknown_ids:
        raise HTTPException(status_code=404, detail="One or more links do not belong to this place")

    increment = max(0, len(data.links) - len(existing))
    if increment:
        QuotaService(database_session).ensure_can_create(
            current_user.id,
            QuotaKey.LINKS_PER_PLACE_MAX,
            scope_id=place_id,
            increment=increment,
        )
    if len(data.links) > MAX_LINKS_PER_PLACE:
        raise HTTPException(status_code=409, detail=f"A place cannot have more than {MAX_LINKS_PER_PLACE} links")

    before = [
        {"id": str(link.id), "url": link.url, "label": link.label, "sort_order": link.sort_order}
        for link in sorted(existing.values(), key=lambda item: (item.sort_order, item.id))
    ]
    result: list[PlaceLink] = []
    for sort_order, item in enumerate(data.links):
        if item.id is None:
            link = PlaceLink(place_id=place_id)
            database_session.add(link)
        else:
            link = existing[item.id]
        link.url = item.url
        link.label = item.label
        link.sort_order = sort_order
        result.append(link)

    for link_id, link in existing.items():
        if link_id not in requested_ids:
            database_session.delete(link)

    database_session.flush()
    after = [
        {"id": str(link.id), "url": link.url, "label": link.label, "sort_order": link.sort_order}
        for link in result
    ]
    if before != after:
        add_place_history(database_session, place.id, current_user.id, "links_replaced", {"links": {"old": before, "new": after}})
    database_session.commit()
    return [_link_read(link) for link in result]


@router.delete("/{place_id}/links/{link_id}", status_code=204)
def delete_place_link(place_id: UUID, link_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    place = require_place_role(database_session, place_id, current_user, "editor")
    link = database_session.scalar(select(PlaceLink).where(PlaceLink.id == link_id, PlaceLink.place_id == place_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    old = {"id": str(link.id), "url": link.url, "label": link.label}
    database_session.delete(link)
    add_place_history(database_session, place.id, current_user.id, "link_removed", {"link": {"old": old, "new": None}})
    database_session.commit()
    return Response(status_code=204)


@router.get("/{place_id}/history", response_model=PlaceHistoryPage)
def get_place_history(place_id: UUID, actions: list[str] = Query(default=[]), offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=100), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceHistoryPage:
    place = require_place_role(database_session, place_id, current_user, "viewer")
    statement = select(PlaceHistory, User.display_name).outerjoin(User, PlaceHistory.user_id == User.id).where(PlaceHistory.place_id == place_id)
    if actions:
        statement = statement.where(PlaceHistory.action.in_(tuple(dict.fromkeys(actions))))
    total = database_session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = database_session.execute(statement.order_by(PlaceHistory.created_at.desc(), PlaceHistory.id.desc()).offset(offset).limit(limit)).all()
    return PlaceHistoryPage(items=[PlaceHistoryRead(id=event.id, user_id=event.user_id, actor_label=actor_label or "Système", action=event.action, object_label=place.name, changes=event.changes, created_at=event.created_at) for event, actor_label in rows], total=total, offset=offset, limit=limit)
