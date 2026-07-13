import pytest
from uuid import uuid4
from starlette.testclient import TestClient

from app.places.schemas import PlaceCreate


pytestmark = pytest.mark.unit


def test_health_endpoint(api_client: TestClient) -> None:
    response = api_client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "POI Manager API is running",
    }


def test_invalid_uuid_is_rejected_without_database(
    api_client: TestClient,
) -> None:
    response = api_client.get("/tags/not-a-uuid")

    assert response.status_code == 422


def test_cors_preflight_allows_write_methods(api_client: TestClient) -> None:
    response = api_client.options(
        "/places/00000000-0000-0000-0000-000000000000",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert "DELETE" in response.headers["access-control-allow-methods"]


def test_place_openapi_and_extra_field_policy_exclude_removed_fields(
    api_client: TestClient,
) -> None:
    openapi = api_client.get("/openapi.json")

    assert openapi.status_code == 200
    schemas = openapi.json()["components"]["schemas"]

    for schema_name in ("PlaceCreate", "PlaceUpdate", "PlaceRead"):
        properties = schemas[schema_name]["properties"]
        assert "address" not in properties
        assert "owner" not in properties
        assert "country" not in properties

    parsed = PlaceCreate.model_validate(
        {
            "name": "Legacy client",
            "map_id": str(uuid4()),
            "latitude": 48.0,
            "longitude": 6.0,
            "address": "ignored",
            "owner": "ignored",
        }
    )
    assert "address" not in parsed.model_dump()
    assert "owner" not in parsed.model_dump()
