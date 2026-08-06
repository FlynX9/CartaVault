import json
from io import BytesIO
from urllib.error import HTTPError

import pytest

from app.config import OpenRouteServiceSettings
from app.trips.routing.base import RouteResult, RoutingError, RoutingProvider
from app.trips.routing.fallback import FallbackRoutingProvider
from app.trips.routing.openrouteservice import OpenRouteServiceProvider


pytestmark = pytest.mark.unit


class Response:
    status = 200
    def __init__(self, payload): self.payload = payload
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def read(self, _limit): return json.dumps(self.payload).encode()


def settings(**changes) -> OpenRouteServiceSettings:
    values = {"base_url": "https://ors.example.test", "timeout_seconds": 7, "max_waypoints": 50}
    values.update(changes)
    return OpenRouteServiceSettings(**values)


def route_payload():
    return {"features": [{"geometry": {"type": "LineString", "coordinates": [[2.0, 48.0], [2.1, 48.1]]}, "properties": {"summary": {"distance": 1234.5, "duration": 321.0}, "segments": [{"distance": 1234.5, "duration": 321.0, "steps": [{"instruction": "Tournez à droite", "distance": 100, "duration": 20}]}]}}]}


def test_ors_directions_are_server_side_normalized_and_localized(monkeypatch) -> None:
    captured = []
    monkeypatch.setattr("app.trips.routing.openrouteservice.urlopen", lambda request, timeout: captured.append((request, timeout)) or Response(route_payload()))
    result = OpenRouteServiceProvider("secret-key", settings(), language="fr").calculate_route([(2, 48), (2.1, 48.1)], "cycling")
    request, timeout = captured[0]
    assert request.full_url == "https://ors.example.test/v2/directions/cycling-regular/geojson"
    assert request.headers["Authorization"] == "secret-key"
    assert json.loads(request.data)["language"] == "fr"
    assert timeout == 7
    assert result.distance_meters == 1234.5
    assert result.segments[0]["steps"][0]["instruction"] == "Tournez à droite"


def test_ors_matrix_and_profiles(monkeypatch) -> None:
    monkeypatch.setattr("app.trips.routing.openrouteservice.urlopen", lambda *_args, **_kwargs: Response({"durations": [[0, 10], [11, 0]], "distances": [[0, 100], [101, 0]]}))
    result = OpenRouteServiceProvider("secret-key", settings()).calculate_matrix([(2, 48), (2.1, 48.1)], "walking")
    assert result.durations[0][1] == 10
    with pytest.raises(RoutingError) as error:
        OpenRouteServiceProvider("secret-key", settings()).calculate_route([(2, 48), (3, 49)], "flying")
    assert error.value.code == "ORS_PROFILE_UNSUPPORTED"


def test_ors_controls_quota_errors_without_leaking_secret(monkeypatch) -> None:
    def reject(*_args, **_kwargs):
        raise HTTPError("https://ors.example.test", 429, "quota", {"Retry-After": "30"}, BytesIO(b"{}"))
    monkeypatch.setattr("app.trips.routing.openrouteservice.urlopen", reject)
    with pytest.raises(RoutingError) as error:
        OpenRouteServiceProvider("never-expose-me", settings()).calculate_route([(2, 48), (3, 49)])
    assert error.value.code == "ORS_QUOTA_EXCEEDED"
    assert error.value.retry_after == 30
    assert "never-expose-me" not in str(error.value)


class StubProvider(RoutingProvider):
    def __init__(self, provider_id: str, error: RoutingError | None = None): self.provider_id = provider_id; self.error = error
    def calculate_route(self, coordinates, profile="driving"):
        if self.error: raise self.error
        return RouteResult({"type": "LineString", "coordinates": coordinates}, 1, 1, [{"distance_meters": 1, "duration_seconds": 1}])
    def calculate_matrix(self, coordinates, profile="driving"):
        if self.error: raise self.error
        raise AssertionError("not used")


def test_ors_fallback_is_limited_to_availability_failures() -> None:
    fallback = FallbackRoutingProvider(StubProvider("openrouteservice", RoutingError("quota", "ORS_QUOTA_EXCEEDED")), StubProvider("osrm"))
    fallback.calculate_route([(2, 48), (3, 49)])
    assert fallback.last_provider_id == "osrm" and fallback.fallback_reason == "ORS_QUOTA_EXCEEDED"
    invalid = FallbackRoutingProvider(StubProvider("openrouteservice", RoutingError("bad", "ORS_COORDINATES_INVALID")), StubProvider("osrm"))
    with pytest.raises(RoutingError): invalid.calculate_route([(2, 48), (3, 49)])
