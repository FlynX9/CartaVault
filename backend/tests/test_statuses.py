from uuid import uuid4

import pytest
from sqlalchemy import select

from app.statuses.models import PlaceStatus


pytestmark = pytest.mark.integration


def test_status_crud_default_and_conflicts(integration_client, database_session) -> None:
    initial = integration_client.get("/statuses")
    assert initial.status_code == 200
    assert any(item["name"] == "À faire" and item["is_default"] for item in initial.json())

    created = integration_client.post(
        "/statuses",
        json={"name": "  À inspecter  ", "color": "#123ABC", "sort_order": 15},
    )
    assert created.status_code == 201
    status_id = created.json()["id"]
    assert created.json()["slug"] == "a-inspecter"

    assert integration_client.get("/statuses", params={"q": "inspect"}).json()[0]["id"] == status_id
    assert integration_client.post(
        "/statuses", json={"name": "À inspecter", "color": "#123ABC"}
    ).status_code == 409
    assert integration_client.post(
        "/statuses", json={"name": "Bad", "color": "blue"}
    ).status_code == 422

    made_default = integration_client.patch(
        f"/statuses/{status_id}", json={"is_default": True, "color": "#ABC123"}
    )
    assert made_default.status_code == 200
    defaults = database_session.scalars(
        select(PlaceStatus).where(PlaceStatus.is_default.is_(True))
    ).all()
    assert [str(item.id) for item in defaults] == [created.json()["id"]]
    assert integration_client.patch(
        f"/statuses/{status_id}", json={"is_active": False}
    ).status_code == 409
    assert integration_client.delete(f"/statuses/{status_id}").status_code == 409

    original_default = next(item for item in initial.json() if item["name"] == "À faire")
    assert integration_client.patch(
        f"/statuses/{original_default['id']}", json={"is_default": True}
    ).status_code == 200
    assert integration_client.patch(
        f"/statuses/{status_id}", json={"is_active": False}
    ).status_code == 200
    assert all(item["id"] != status_id for item in integration_client.get(
        "/statuses", params={"active_only": True}
    ).json())
    assert integration_client.delete(f"/statuses/{status_id}").status_code == 204
    assert integration_client.get(f"/statuses/{uuid4()}").status_code == 404


def test_places_use_and_filter_tracking_status(integration_client, poi_map) -> None:
    explicit = integration_client.post(
        "/statuses",
        json={"name": "Photographié", "color": "#16A34A"},
    ).json()
    default_place = integration_client.post(
        "/places",
        json={"name": "Default", "map_id": str(poi_map.id), "latitude": 48.1, "longitude": 2.1},
    )
    explicit_place = integration_client.post(
        "/places",
        json={"name": "Explicit", "map_id": str(poi_map.id), "status_id": explicit["id"], "latitude": 48.2, "longitude": 2.2},
    )
    assert default_place.status_code == explicit_place.status_code == 201
    assert default_place.json()["status"]["is_active"] is True
    assert explicit_place.json()["status"]["id"] == explicit["id"]

    filtered = integration_client.get(
        "/places/map",
        params={"map_id": str(poi_map.id), "status_id": explicit["id"], "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3},
    )
    assert filtered.status_code == 200
    assert [item["name"] for item in filtered.json()] == ["Explicit"]
    assert filtered.json()[0]["status"]["color"] == "#16A34A"
    assert "is_active" not in filtered.json()[0]["status"]
    assert integration_client.get(
        "/places/map",
        params={"status_id": str(uuid4()), "min_latitude": 48, "max_latitude": 49, "min_longitude": 2, "max_longitude": 3},
    ).json() == []
    assert integration_client.delete(f"/statuses/{explicit['id']}").status_code == 409
    assert integration_client.delete(f"/places/{explicit_place.json()['id']}").status_code == 204
    assert integration_client.delete(f"/places/{explicit_place.json()['id']}/permanent").status_code == 204
    assert integration_client.delete(f"/statuses/{explicit['id']}").status_code == 204
