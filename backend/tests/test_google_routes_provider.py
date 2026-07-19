import json

import pytest

from app.config import GoogleRoutesSettings
from app.trips.routing.base import RoutingError
from app.trips.routing.google import GoogleRoutesProvider, decode_polyline, parse_duration
from app.trips.routing.registry import GoogleRoutingRateLimiter, RoutingProviderRegistry


pytestmark = pytest.mark.unit


class Response:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, _limit): return json.dumps(self.payload).encode()


def settings() -> GoogleRoutesSettings:
    return GoogleRoutesSettings(api_key="test-only", base_url="https://routes.example.test")


def route_payload(order=None):
    route = {
        "distanceMeters": 12_345,
        "duration": "1234.500s",
        "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
        "legs": [
            {"distanceMeters": 5_000, "duration": "500s"},
            {"distanceMeters": 7_345, "duration": "734.5s"},
        ],
    }
    if order is not None:
        route["optimizedIntermediateWaypointIndex"] = order
    return {"routes": [route]}


def test_google_compute_routes_is_backend_only_and_normalized(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.trips.routing.google.urlopen", lambda request, timeout: captured.append((request, timeout)) or Response(route_payload()))
    result = GoogleRoutesProvider(settings()).calculate_route([(-120.2, 38.5), (-120.95, 40.7), (-126.453, 43.252)])
    request, timeout = captured[0]
    body = json.loads(request.data)
    assert request.full_url == "https://routes.example.test/directions/v2:computeRoutes"
    assert request.headers["X-goog-api-key"] == "test-only"
    assert "routes.*" not in request.headers["X-goog-fieldmask"]
    assert body["routingPreference"] == "TRAFFIC_UNAWARE"
    assert result.distance_meters == 12_345
    assert result.duration_seconds == 1234.5
    assert result.geometry["type"] == "LineString"
    assert timeout == 15


def test_google_optimization_validates_returned_permutation(monkeypatch) -> None:
    monkeypatch.setattr("app.trips.routing.google.urlopen", lambda *_args, **_kwargs: Response(route_payload([0])))
    assert GoogleRoutesProvider(settings()).optimize_waypoint_order([(2, 48), (2.5, 48.5), (3, 49)]) == [0]
    monkeypatch.setattr("app.trips.routing.google.urlopen", lambda *_args, **_kwargs: Response(route_payload([1])))
    with pytest.raises(RoutingError, match="invalid waypoint order"):
        GoogleRoutesProvider(settings()).optimize_waypoint_order([(2, 48), (2.5, 48.5), (3, 49)])


def test_google_limits_intermediate_waypoints_without_calling_api() -> None:
    with pytest.raises(RoutingError) as error:
        GoogleRoutesProvider(settings()).calculate_route([(2 + index / 100, 48) for index in range(28)])
    assert error.value.code == "GOOGLE_WAYPOINT_LIMIT_EXCEEDED"


def test_google_duration_and_polyline_parsing_are_strict() -> None:
    assert parse_duration("12.25s") == 12.25
    assert decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")[-1] == [-126.453, 43.252]
    with pytest.raises(RoutingError): parse_duration("12 seconds")
    with pytest.raises(RoutingError): decode_polyline("invalid")


def test_registry_exposes_capabilities_without_secret_and_rejects_unknown(monkeypatch) -> None:
    registry = RoutingProviderRegistry()
    serialized = json.dumps(registry.capabilities())
    assert "test-only" not in serialized
    assert {item["id"] for item in registry.capabilities()} == {"osrm", "google"}
    with pytest.raises(RoutingError) as error:
        registry.resolve("other")
    assert error.value.code == "ROUTING_PROVIDER_UNKNOWN"
    monkeypatch.setattr("app.trips.routing.registry.google_routes_settings", settings())
    resolved = registry.resolve("google", {"avoid_tolls": True, "traffic_mode": "traffic_aware"})
    assert isinstance(resolved, GoogleRoutesProvider)
    assert resolved.settings.avoid_tolls is True
    assert resolved.settings.routing_preference == "TRAFFIC_AWARE"


def test_google_rate_limiter_is_explicit() -> None:
    limiter = GoogleRoutingRateLimiter(limit=2, window_seconds=60)
    limiter.check("user")
    limiter.check("user")
    with pytest.raises(RoutingError) as error:
        limiter.check("user")
    assert error.value.code == "GOOGLE_ROUTING_RATE_LIMITED"
