"""AUD-021: the media catalogue must be served from DB metadata only.

The listing declares a file_state derived from stored columns; the physical
blob is verified only when content is actually served (file/download/thumbnail).
A blob removed out-of-band therefore stays "healthy" until read - this is a
voluntary semantic change documented by these tests.
"""

from io import BytesIO
from uuid import UUID, uuid4

import pytest
from PIL import Image
from starlette.testclient import TestClient

from app.auth.models import User
from app.photos.models import Photo
from app.places.models import Place


pytestmark = pytest.mark.integration


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (24, 16), "#0fa68a").save(output, format="PNG")
    return output.getvalue()


def create_place(client: TestClient, poi_map) -> str:
    response = client.post(
        "/places",
        json={"name": f"Listing {uuid4().hex}", "map_id": str(poi_map.id), "latitude": 45.764, "longitude": 4.8357},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload_place_photo(client: TestClient, place_id: str, name: str) -> dict:
    uploaded = client.post(
        f"/places/{place_id}/photos/upload",
        files={"file": (name, png_bytes(), "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    return uploaded.json()


def test_media_listing_performs_zero_physical_io(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.media.router as media_router_module
    import app.photos.storage as photo_storage_module

    place_id = create_place(integration_client, poi_map)
    first = upload_place_photo(integration_client, place_id, "io-one.png")
    second = upload_place_photo(integration_client, place_id, "io-two.png")

    calls = {"resolve": 0, "thumbnail": 0, "dimensions": 0, "pil": 0, "storage": 0}
    original_resolve = photo_storage_module.resolve_photo_file
    original_thumbnail = media_router_module.get_photo_thumbnail
    original_dimensions = photo_storage_module.read_photo_dimensions
    original_image_open = media_router_module.Image.open
    original_build = photo_storage_module.build_object_storage

    def counting_resolve(*args, **kwargs):
        calls["resolve"] += 1
        return original_resolve(*args, **kwargs)

    def counting_dimensions(*args, **kwargs):
        calls["dimensions"] += 1
        return original_dimensions(*args, **kwargs)

    def counting_thumbnail(*args, **kwargs):
        calls["thumbnail"] += 1
        return original_thumbnail(*args, **kwargs)

    def counting_image_open(*args, **kwargs):
        calls["pil"] += 1
        return original_image_open(*args, **kwargs)

    def counting_build(*args, **kwargs):
        calls["storage"] += 1
        return original_build(*args, **kwargs)

    monkeypatch.setattr(photo_storage_module, "resolve_photo_file", counting_resolve)
    monkeypatch.setattr(media_router_module, "resolve_photo_file", counting_resolve)
    monkeypatch.setattr(media_router_module, "get_photo_thumbnail", counting_thumbnail)
    monkeypatch.setattr(photo_storage_module, "read_photo_dimensions", counting_dimensions)
    monkeypatch.setattr(media_router_module.Image, "open", counting_image_open)
    monkeypatch.setattr(photo_storage_module, "build_object_storage", counting_build)

    response = integration_client.get("/media?page=1&page_size=100")

    assert response.status_code == 200
    assert calls == {"resolve": 0, "thumbnail": 0, "dimensions": 0, "pil": 0, "storage": 0}, calls

    integration_client.delete(f"/photos/{first['id']}")
    integration_client.delete(f"/photos/{second['id']}")


def test_blob_removed_out_of_band_stays_declared_until_served(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
    photo_storage,
) -> None:
    place_id = create_place(integration_client, poi_map)
    upload = upload_place_photo(integration_client, place_id, "vanished.png")
    media_id = UUID(upload["id"])
    photo_row = database_session.get(Photo, media_id)
    (photo_storage / photo_row.path).unlink()

    page = integration_client.get("/media", params={"page_size": 100})
    assert page.status_code == 200
    item = next(entry for entry in page.json()["items"] if entry["id"] == str(media_id))
    # Declared state only: complete DB metadata keeps the catalogue healthy.
    assert item["file_state"] == "healthy"

    # Serving the content performs the real verification.
    assert integration_client.get(f"/media/{media_id}/download").status_code == 404

    integration_client.delete(f"/photos/{str(media_id)}")


def test_catalogue_states_match_filters_and_aggregates(
    integration_client: TestClient,
    database_session,
    poi_map,
    auth_user: User,
) -> None:
    place_id = create_place(integration_client, poi_map)
    healthy = upload_place_photo(integration_client, place_id, "healthy.png")

    def insert_photo(
        sort_order: int,
        path: str | None,
        width: int | None,
        height: int | None,
        *,
        storage_state: str = "unchecked",
    ) -> Photo:
        photo = Photo(
            place_id=UUID(place_id),
            map_id=poi_map.id,
            storage_scope_id=UUID(place_id),
            filename=f"{uuid4().hex}.png",
            mime_type="image/png",
            file_size_bytes=32,
            path=path,
            width=width,
            height=height,
            sort_order=sort_order,
            is_primary=False,
            storage_state=storage_state,
        )
        database_session.add(photo)
        database_session.flush()
        return photo

    scope_id = uuid4()
    missing = insert_photo(sort_order=9, path=None, width=None, height=None)
    error = insert_photo(sort_order=10, path=f"{scope_id}/{uuid4()}.png", width=None, height=None)
    declared = insert_photo(sort_order=11, path=f"{uuid4()}/{uuid4()}.png", width=10, height=10)
    reconciled_missing = insert_photo(
        sort_order=12,
        path=f"{uuid4()}/{uuid4()}.png",
        width=10,
        height=10,
        storage_state="missing",
    )

    page = integration_client.get("/media", params={"page_size": 100, "sort_by": "created_at"})
    assert page.status_code == 200
    payload = page.json()
    items = {entry["id"]: entry["file_state"] for entry in payload["items"]}

    expected = {
        healthy["id"]: "healthy",
        str(declared.id): "healthy",
        str(missing.id): "missing",
        str(reconciled_missing.id): "missing",
        str(error.id): "error",
    }
    assert items == expected

    # Filters must select exactly the same categories as the listed states.
    for state, ids in (
        ("healthy", {healthy["id"], str(declared.id)}),
        ("missing", {str(missing.id), str(reconciled_missing.id)}),
        ("error", {str(error.id)}),
    ):
        filtered = integration_client.get("/media", params={"file_state": state, "page_size": 100})
        assert filtered.status_code == 200
        assert {entry["id"] for entry in filtered.json()["items"]} == set(ids), state

    aggregates = payload["aggregates"]
    assert aggregates["missing_count"] == 2
    assert aggregates["error_count"] == 1

    for media_id in (healthy["id"], str(declared.id)):
        integration_client.delete(f"/photos/{media_id}")
