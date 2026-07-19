from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from app.config import routing_settings
from app.trips.routing.base import Coordinate, MatrixResult, RouteResult, RoutingError, RoutingProvider


class OsrmRoutingProvider(RoutingProvider):
    provider_id = "osrm"
    label = "OSRM"
    def __init__(self, base_url: str | None = None, timeout: int | None = None, max_waypoints: int | None = None):
        self.base_url = (base_url or routing_settings.base_url).rstrip("/")
        self.timeout = timeout or routing_settings.timeout_seconds
        self.max_waypoints = max_waypoints or routing_settings.max_waypoints
        parts = urlsplit(self.base_url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise RuntimeError("OSRM_BASE_URL must be a fixed HTTP(S) service URL")

    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult:
        self._validate(coordinates)
        payload = self._get(f"route/v1/{profile}/{self._coordinates(coordinates)}", {"overview": "full", "geometries": "geojson", "steps": "false"})
        routes = payload.get("routes") or []
        if payload.get("code") != "Ok" or not routes: raise RoutingError("No route could be calculated")
        route = routes[0]
        legs = [{"distance_meters": float(leg.get("distance", 0)), "duration_seconds": float(leg.get("duration", 0))} for leg in route.get("legs", [])]
        return RouteResult(route["geometry"], float(route["distance"]), float(route["duration"]), legs)

    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult:
        self._validate(coordinates)
        payload = self._get(f"table/v1/{profile}/{self._coordinates(coordinates)}", {"annotations": "duration,distance"})
        if payload.get("code") != "Ok" or not isinstance(payload.get("durations"), list): raise RoutingError("No routing matrix could be calculated")
        distances = payload.get("distances")
        if not isinstance(distances, list): raise RoutingError("OSRM returned an invalid distance matrix")
        return MatrixResult(payload["durations"], distances)

    def _get(self, path: str, parameters: dict[str, str]) -> dict:
        request = Request(f"{self.base_url}/{path}?{urlencode(parameters)}", headers={"Accept": "application/json", "User-Agent": "CartaVault/1"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                if response.status != 200: raise RoutingError("Routing service rejected the request")
                payload = json.loads(response.read(8 * 1024 * 1024))
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            raise RoutingError("Routing service is unavailable or returned invalid data") from error
        if not isinstance(payload, dict): raise RoutingError("Routing service returned invalid data")
        return payload

    def _validate(self, coordinates: list[Coordinate]) -> None:
        if len(coordinates) < 2: raise RoutingError("At least two points are required")
        if len(coordinates) > self.max_waypoints: raise RoutingError(f"Routing is limited to {self.max_waypoints} points")
        if any(not (-180 <= longitude <= 180 and -90 <= latitude <= 90) for longitude, latitude in coordinates): raise RoutingError("Invalid routing coordinates")

    @staticmethod
    def _coordinates(coordinates: list[Coordinate]) -> str:
        return ";".join(f"{longitude:.7f},{latitude:.7f}" for longitude, latitude in coordinates)
