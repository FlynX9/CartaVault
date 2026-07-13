from pathlib import Path
from uuid import uuid4

import pytest
from starlette.testclient import TestClient


pytestmark = pytest.mark.integration


JPEG_BYTES = b"\xff\xd8\xff\xe0integration-jpeg\xff\xd9"


def test_photo_upload_download_and_delete(
    integration_client: TestClient,
    photo_storage: Path,
) -> None:
    place_response = integration_client.post(
        "/places",
        json={
            "name": f"Photo Place {uuid4().hex}",
            "latitude": 45.764,
            "longitude": 4.8357,
        },
    )
    assert place_response.status_code == 201
    place_id = place_response.json()["id"]

    uploaded = integration_client.post(
        f"/places/{place_id}/photos/upload",
        files={
            "file": (
                "integration.jpg",
                JPEG_BYTES,
                "image/jpeg",
            ),
        },
        data={"description": "pytest upload"},
    )
    assert uploaded.status_code == 201
    photo = uploaded.json()
    photo_id = photo["id"]
    stored_path = photo_storage / Path(photo["path"])
    assert stored_path.read_bytes() == JPEG_BYTES

    downloaded = integration_client.get(f"/photos/{photo_id}/file")
    assert downloaded.status_code == 200
    assert downloaded.content == JPEG_BYTES

    listed = integration_client.get(f"/places/{place_id}/photos")
    assert listed.status_code == 200
    assert photo_id in {item["id"] for item in listed.json()}

    deleted = integration_client.delete(f"/photos/{photo_id}")
    assert deleted.status_code == 204
    assert not stored_path.exists()

    missing = integration_client.get(f"/photos/{photo_id}")
    assert missing.status_code == 404
