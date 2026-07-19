from __future__ import annotations

import json
import logging
import math
import re
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from time import perf_counter

from app.config import GoogleRoutesSettings, google_routes_settings
from app.trips.routing.base import Coordinate, MatrixResult, RouteResult, RoutingError, RoutingProvider

_DURATION = re.compile(r"^(\d+)(?:\.(\d{1,9}))?s$")
_NORMAL_FIELDS = ",".join((
    "routes.distanceMeters",
    "routes.duration",
    "routes.polyline.encodedPolyline",
    "routes.legs.distanceMeters",
    "routes.legs.duration",
))
_OPTIMIZATION_FIELDS = f"{_NORMAL_FIELDS},routes.optimizedIntermediateWaypointIndex"
logger = logging.getLogger(__name__)


def decode_polyline(value: str) -> list[list[float]]:
    if not value:
        raise RoutingError("Google Routes returned an empty polyline", "GOOGLE_ROUTES_INVALID_RESPONSE")
    coordinates: list[list[float]] = []
    latitude = longitude = index = 0
    try:
        while index < len(value):
            deltas: list[int] = []
            for _ in range(2):
                result = shift = 0
                while True:
                    byte = ord(value[index]) - 63
                    index += 1
                    if byte < 0 or byte > 63:
                        raise ValueError
                    result |= (byte & 0x1F) << shift
                    shift += 5
                    if byte < 0x20:
                        break
                    if shift > 30:
                        raise ValueError
                deltas.append(~(result >> 1) if result & 1 else result >> 1)
            latitude += deltas[0]
            longitude += deltas[1]
            coordinates.append([longitude / 100_000, latitude / 100_000])
    except (IndexError, ValueError) as error:
        raise RoutingError("Google Routes returned an invalid polyline", "GOOGLE_ROUTES_INVALID_RESPONSE") from error
    if len(coordinates) < 2 or any(not (-180 <= item[0] <= 180 and -90 <= item[1] <= 90) for item in coordinates):
        raise RoutingError("Google Routes returned an invalid polyline", "GOOGLE_ROUTES_INVALID_RESPONSE")
    return coordinates


def parse_duration(value: object) -> float:
    if not isinstance(value, str) or not (match := _DURATION.fullmatch(value)):
        raise RoutingError("Google Routes returned an invalid duration", "GOOGLE_ROUTES_INVALID_RESPONSE")
    seconds = float(match.group(1))
    if match.group(2):
        seconds += int(match.group(2)) / (10 ** len(match.group(2)))
    if not math.isfinite(seconds) or seconds < 0:
        raise RoutingError("Google Routes returned an invalid duration", "GOOGLE_ROUTES_INVALID_RESPONSE")
    return seconds


class GoogleRoutesProvider(RoutingProvider):
    provider_id = "google"
    label = "Google Routes"
    supports_matrix = False
    supports_waypoint_optimization = True
    max_intermediates = 25

    def __init__(self, settings: GoogleRoutesSettings | None = None, before_request: Callable[[], None] | None = None):
        self.settings = settings or google_routes_settings
        self.before_request = before_request
        parts = urlsplit(self.settings.base_url)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise RuntimeError("GOOGLE_MAPS_ROUTES_BASE_URL must be a fixed HTTPS service URL")
        if not self.settings.api_key:
            raise RoutingError("Le moteur Google Routes n’est pas configuré sur ce serveur.", "ROUTING_PROVIDER_UNAVAILABLE")

    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult:
        return self._logged_compute(coordinates, profile, optimize=False)[0]

    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult:
        raise RoutingError("Google Routes does not expose a matrix in CartaVault", "ROUTING_CAPABILITY_UNAVAILABLE")

    def optimize_waypoint_order(self, coordinates: list[Coordinate], profile: str = "driving") -> list[int]:
        _, order = self._logged_compute(coordinates, profile, optimize=True)
        expected = list(range(max(0, len(coordinates) - 2)))
        if sorted(order) != expected:
            raise RoutingError("Google Routes returned an invalid waypoint order", "GOOGLE_ROUTES_INVALID_RESPONSE")
        return order

    def _logged_compute(self, coordinates: list[Coordinate], profile: str, *, optimize: bool) -> tuple[RouteResult, list[int]]:
        started = perf_counter()
        try:
            result = self._compute(coordinates, profile, optimize=optimize)
        except RoutingError as error:
            logger.warning("Google routing failed type=%s waypoints=%d code=%s elapsed_ms=%d", "optimize" if optimize else "route", len(coordinates), error.code, round((perf_counter() - started) * 1000))
            raise
        logger.info("Google routing succeeded type=%s waypoints=%d elapsed_ms=%d", "optimize" if optimize else "route", len(coordinates), round((perf_counter() - started) * 1000))
        return result

    def _compute(self, coordinates: list[Coordinate], profile: str, *, optimize: bool) -> tuple[RouteResult, list[int]]:
        self._validate(coordinates, profile, optimize)
        payload = {
            "origin": self._waypoint(coordinates[0]),
            "destination": self._waypoint(coordinates[-1]),
            "intermediates": [self._waypoint(item) for item in coordinates[1:-1]],
            "travelMode": "DRIVE",
            "routingPreference": self.settings.routing_preference,
            "computeAlternativeRoutes": False,
            "routeModifiers": {
                "avoidTolls": self.settings.avoid_tolls,
                "avoidHighways": self.settings.avoid_highways,
                "avoidFerries": self.settings.avoid_ferries,
            },
            "languageCode": "fr-FR",
            "units": "METRIC",
        }
        if optimize:
            payload["optimizeWaypointOrder"] = True
        response = self._post(payload, _OPTIMIZATION_FIELDS if optimize else _NORMAL_FIELDS)
        routes = response.get("routes")
        if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
            raise RoutingError("Google Routes n’a trouvé aucun itinéraire.", "GOOGLE_ROUTES_NO_ROUTE")
        route = routes[0]
        distance = self._distance(route.get("distanceMeters"))
        duration = parse_duration(route.get("duration"))
        polyline = route.get("polyline")
        encoded = polyline.get("encodedPolyline") if isinstance(polyline, dict) else None
        geometry = {"type": "LineString", "coordinates": decode_polyline(encoded if isinstance(encoded, str) else "")}
        legs_payload = route.get("legs")
        if not isinstance(legs_payload, list):
            raise RoutingError("Google Routes returned invalid route legs", "GOOGLE_ROUTES_INVALID_RESPONSE")
        legs = []
        for leg in legs_payload:
            if not isinstance(leg, dict):
                raise RoutingError("Google Routes returned invalid route legs", "GOOGLE_ROUTES_INVALID_RESPONSE")
            legs.append({"distance_meters": self._distance(leg.get("distanceMeters")), "duration_seconds": parse_duration(leg.get("duration"))})
        if len(legs) != len(coordinates) - 1:
            raise RoutingError("Google Routes returned an inconsistent route", "GOOGLE_ROUTES_INVALID_RESPONSE")
        raw_order = route.get("optimizedIntermediateWaypointIndex", []) if optimize else []
        if not isinstance(raw_order, list) or any(not isinstance(item, int) for item in raw_order):
            raise RoutingError("Google Routes returned an invalid waypoint order", "GOOGLE_ROUTES_INVALID_RESPONSE")
        return RouteResult(geometry, distance, duration, legs), raw_order

    def _post(self, payload: dict[str, object], field_mask: str) -> dict:
        if self.before_request:
            self.before_request()
        request = Request(
            f"{self.settings.base_url.rstrip('/')}/directions/v2:computeRoutes",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": self.settings.api_key, "X-Goog-FieldMask": field_mask, "User-Agent": "CartaVault/1"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                if response.status != 200:
                    raise RoutingError("Google Routes a refusé la requête.", "GOOGLE_ROUTES_PROVIDER_ERROR")
                result = json.loads(response.read(8 * 1024 * 1024))
        except HTTPError as error:
            if error.code in {401, 403}:
                raise RoutingError("Google Routes a refusé l’authentification du serveur.", "GOOGLE_ROUTES_AUTH_ERROR") from error
            if error.code == 429:
                raise RoutingError("Le quota Google Routes est temporairement dépassé.", "GOOGLE_ROUTES_QUOTA_EXCEEDED") from error
            raise RoutingError("Google Routes est temporairement indisponible.", "GOOGLE_ROUTES_PROVIDER_ERROR") from error
        except (TimeoutError, OSError) as error:
            raise RoutingError("Google Routes n’a pas répondu dans le délai imparti.", "GOOGLE_ROUTES_TIMEOUT") from error
        except (URLError, json.JSONDecodeError) as error:
            raise RoutingError("Google Routes a retourné une réponse invalide.", "GOOGLE_ROUTES_INVALID_RESPONSE") from error
        if not isinstance(result, dict):
            raise RoutingError("Google Routes a retourné une réponse invalide.", "GOOGLE_ROUTES_INVALID_RESPONSE")
        return result

    def _validate(self, coordinates: list[Coordinate], profile: str, optimize: bool) -> None:
        if profile != "driving":
            raise RoutingError("Google Routes ne prend en charge que le profil voiture dans CartaVault.", "ROUTING_PROFILE_UNAVAILABLE")
        if len(coordinates) < 2:
            raise RoutingError("At least two points are required")
        if len(coordinates) - 2 > self.max_intermediates:
            raise RoutingError("Google Routes accepte au maximum 25 étapes intermédiaires pour un itinéraire.", "GOOGLE_WAYPOINT_LIMIT_EXCEEDED")
        if optimize and self.settings.routing_preference == "TRAFFIC_AWARE_OPTIMAL":
            raise RoutingError("L’optimisation Google n’est pas compatible avec le trafic optimal.", "ROUTING_OPTIONS_INCOMPATIBLE")
        if any(not (-180 <= longitude <= 180 and -90 <= latitude <= 90) for longitude, latitude in coordinates):
            raise RoutingError("Invalid routing coordinates")

    @staticmethod
    def _waypoint(coordinate: Coordinate) -> dict[str, object]:
        longitude, latitude = coordinate
        return {"location": {"latLng": {"latitude": latitude, "longitude": longitude}}}

    @staticmethod
    def _distance(value: object) -> float:
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise RoutingError("Google Routes returned an invalid distance", "GOOGLE_ROUTES_INVALID_RESPONSE")
        return float(value)
