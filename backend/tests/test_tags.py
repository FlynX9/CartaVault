from uuid import uuid4

import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.integration


def test_tag_crud_search_conflict_and_delete(
    integration_client: TestClient,
) -> None:
    initial_name = f"Pytest Tag {uuid4().hex}"
    updated_name = f"Updated Tag {uuid4().hex}"

    created = integration_client.post(
        "/tags",
        json={"name": initial_name},
    )
    assert created.status_code == 201
    tag_id = created.json()["id"]

    read = integration_client.get(f"/tags/{tag_id}")
    assert read.status_code == 200
    assert read.json()["name"] == initial_name

    searched = integration_client.get(
        "/tags",
        params={"q": initial_name.swapcase()},
    )
    assert searched.status_code == 200
    assert tag_id in {tag["id"] for tag in searched.json()}

    duplicate = integration_client.post(
        "/tags",
        json={"name": initial_name},
    )
    assert duplicate.status_code == 409

    updated = integration_client.patch(
        f"/tags/{tag_id}",
        json={"name": updated_name},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == updated_name

    deleted = integration_client.delete(f"/tags/{tag_id}")
    assert deleted.status_code == 204

    missing = integration_client.get(f"/tags/{tag_id}")
    assert missing.status_code == 404
