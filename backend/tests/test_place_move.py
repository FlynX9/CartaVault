from uuid import uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.statuses.service import create_default_statuses
from app.trips.models import TripStop


pytestmark = pytest.mark.integration


def _target_map(session: Session, poi_map: PoiMap) -> PoiMap:
    target = PoiMap(name=f"Target {uuid4()}", country_id=poi_map.country_id, owner_id=poi_map.owner_id, is_private=True)
    session.add(target)
    session.flush()
    session.add(MapMembership(map_id=target.id, user_id=poi_map.owner_id, role="owner"))
    create_default_statuses(session, target.id)
    session.commit()
    return target


def _default_status(session: Session, map_id):
    return session.scalar(select(PlaceStatus).where(PlaceStatus.map_id == map_id, PlaceStatus.is_default.is_(True)))


def _place(client: TestClient, poi_map: PoiMap) -> dict:
    response = client.post("/places", json={"name": f"Movable {uuid4()}", "map_id": str(poi_map.id), "latitude": 48.8566, "longitude": 2.3522})
    assert response.status_code == 201
    return response.json()


def test_move_place_updates_status_photos_and_history(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    photo = Photo(place_id=place["id"], map_id=poi_map.id, filename="move.png", path="unchanged.png", storage_scope_id=uuid4(), sort_order=0)
    database_session.add(photo)
    database_session.commit()

    moved = integration_client.post(f"/places/{place['id']}/move", json={"target_map_id": str(target.id), "target_status_id": str(_default_status(database_session, target.id).id)})

    assert moved.status_code == 200
    assert moved.json()["map_id"] == str(target.id)
    assert moved.json()["status"]["map_id"] == str(target.id)
    database_session.refresh(photo)
    assert photo.map_id == target.id
    assert photo.path == "unchanged.png"
    history = integration_client.get(f"/places/{place['id']}/history").json()["items"]
    moved_history = next(item for item in history if item["action"] == "moved")
    assert moved_history["changes"]["map_id"]["new"] == str(target.id)


def test_move_place_blocks_map_scoped_associations_and_trip_references(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    category = integration_client.post("/categories", json={"map_id": str(poi_map.id), "name": f"Move category {uuid4()}"})
    assert category.status_code == 201
    assert integration_client.post(f"/places/{place['id']}/categories/{category.json()['id']}").status_code == 200
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Move blocker"}).json()
    day_id = trip["days"][0]["id"]
    assert integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": place["id"]}).status_code == 201

    blocked = integration_client.post(f"/places/{place['id']}/move", json={"target_map_id": str(target.id), "target_status_id": str(_default_status(database_session, target.id).id)})

    assert blocked.status_code == 409
    assert blocked.json()["detail"] == {
        "code": "PLACE_MOVE_BLOCKED",
        "message": "Ce lieu ne peut pas être déplacé tant que certaines dépendances existent.",
        "blockers": {"categories": 1, "tags": 0, "annotations": 0, "trip_stops": 1, "trip_nights": 0, "trip_anchors": 0},
    }


def test_move_place_rejects_source_status_and_same_map_is_noop(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    source_status = _default_status(database_session, poi_map.id)

    invalid = integration_client.post(f"/places/{place['id']}/move", json={"target_map_id": str(target.id), "target_status_id": str(source_status.id)})
    same_map = integration_client.post(f"/places/{place['id']}/move", json={"target_map_id": str(poi_map.id), "target_status_id": str(source_status.id)})

    assert invalid.status_code == 409
    assert same_map.status_code == 200
    assert same_map.json()["map_id"] == str(poi_map.id)


def test_bulk_association_revalidates_the_locked_place_map(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    category = integration_client.post("/categories", json={"map_id": str(poi_map.id), "name": f"Source category {uuid4()}"}).json()

    # Model the serialised outcome where the move acquired the Place lock first.
    database_session.execute(update(Place).where(Place.id == place["id"]).values(map_id=target.id))
    database_session.commit()
    updated = integration_client.post("/places/bulk", json={"place_ids": [place["id"]], "action": "add_category", "category_id": category["id"]})

    assert updated.status_code == 409
    assert updated.json()["detail"] == "BULK_CATEGORY_FORBIDDEN"


def test_restore_rejects_a_snapshot_place_moved_before_reinsertion(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Restore lock"}).json()
    day_id = trip["days"][0]["id"]
    stop = integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": place["id"]}).json()
    snapshot = integration_client.get(f"/trips/{trip['id']}").json()
    assert integration_client.delete(f"/trip-stops/{stop['id']}").status_code == 204

    database_session.execute(update(Place).where(Place.id == place["id"]).values(map_id=target.id))
    database_session.commit()
    restored = integration_client.put(f"/trips/{trip['id']}/state", json=snapshot)

    assert restored.status_code == 422
    assert database_session.scalar(select(TripStop).where(TripStop.trip_day_id == day_id)) is None


def test_attach_media_uses_the_place_map_after_a_completed_move(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    photo = Photo(map_id=poi_map.id, filename="pending.png", storage_scope_id=uuid4())
    database_session.add(photo)
    database_session.flush()
    database_session.execute(update(Place).where(Place.id == place["id"]).values(map_id=target.id))
    database_session.commit()

    attached = integration_client.post(f"/media-actions/{photo.id}/attach-place", json={"place_id": place["id"]})

    assert attached.status_code == 200, attached.text
    database_session.refresh(photo)
    assert str(photo.place_id) == place["id"]
    assert photo.map_id == target.id


def test_apply_place_statuses_rejects_a_cross_map_stop_reference(integration_client: TestClient, database_session: Session, poi_map: PoiMap) -> None:
    target = _target_map(database_session, poi_map)
    place = _place(integration_client, poi_map)
    trip = integration_client.post(f"/maps/{poi_map.id}/trips", json={"name": "Status guard"}).json()
    day_id = trip["days"][0]["id"]
    assert integration_client.post(f"/trip-days/{day_id}/stops", json={"place_id": place["id"]}).status_code == 201
    source_status = _default_status(database_session, poi_map.id)

    database_session.execute(update(Place).where(Place.id == place["id"]).values(map_id=target.id))
    database_session.commit()
    applied = integration_client.post(f"/trips/{trip['id']}/apply-place-statuses", json={"mappings": {"planned": str(source_status.id)}, "confirm": True})

    assert applied.status_code == 409
    database_session.refresh(source_status)
    assert source_status.map_id == poi_map.id
