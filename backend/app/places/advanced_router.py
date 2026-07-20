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
from app.places.router import place_to_read, build_place_read_statement
from app.places.schemas import PlaceHistoryRead, PlaceLinkCreate, PlaceLinkRead, PlaceLinkUpdate, PlaceRead

router = APIRouter(prefix="/places", tags=["places advanced"])
MAX_LINKS_PER_PLACE = 20


def _link_read(link: PlaceLink) -> PlaceLinkRead:
    return PlaceLinkRead.model_validate(link, from_attributes=True)


@router.get("/trash", response_model=list[PlaceRead])
def list_trashed_places(map_id: UUID = Query(), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceRead]:
    require_map_role(database_session, map_id, current_user, "editor")
    rows = database_session.execute(build_place_read_statement().where(Place.map_id == map_id, Place.deleted_at.is_not(None)).order_by(Place.deleted_at.desc(), Place.id)).all()
    return [place_to_read(place, longitude, latitude, database_session) for place, longitude, latitude in rows]


@router.post("/{place_id}/restore", response_model=PlaceRead)
def restore_place(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceRead:
    place = require_place_role(database_session, place_id, current_user, "editor", include_deleted=True)
    if place.deleted_at is None:
        raise HTTPException(status_code=409, detail="The place is not in the trash")
    place.deleted_at = None
    place.deleted_by_user_id = None
    add_place_history(database_session, place.id, current_user.id, "restored", {})
    database_session.commit()
    place, longitude, latitude = database_session.execute(build_place_read_statement().where(Place.id == place_id)).one()
    return place_to_read(place, longitude, latitude, database_session)


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
    if database_session.scalar(select(func.count()).select_from(PlaceLink).where(PlaceLink.place_id == place_id)) >= MAX_LINKS_PER_PLACE:
        raise HTTPException(status_code=409, detail=f"A place cannot have more than {MAX_LINKS_PER_PLACE} links")
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
    before = {"url": link.url, "label": link.label, "sort_order": link.sort_order}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    after = {"url": link.url, "label": link.label, "sort_order": link.sort_order}
    add_place_history(database_session, place.id, current_user.id, "link_updated", {"link": {"old": before, "new": after}})
    database_session.commit()
    database_session.refresh(link)
    return _link_read(link)


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


@router.get("/{place_id}/history", response_model=list[PlaceHistoryRead])
def get_place_history(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceHistoryRead]:
    require_place_role(database_session, place_id, current_user, "viewer")
    events = database_session.scalars(select(PlaceHistory).where(PlaceHistory.place_id == place_id).order_by(PlaceHistory.created_at.desc(), PlaceHistory.id.desc()).limit(200)).all()
    return [PlaceHistoryRead.model_validate(event, from_attributes=True) for event in events]
