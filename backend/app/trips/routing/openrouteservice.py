from __future__ import annotations

import json
import math
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from app.config import OpenRouteServiceSettings, openroute_service_settings
from app.trips.routing.base import Coordinate, MatrixResult, RouteResult, RoutingError, RoutingProvider


_PROFILES = {
    "driving": "driving-car",
    "cycling": "cycling-regular",
    "walking": "foot-walking",
    "wheelchair": "wheelchair",
}


class OpenRouteServiceProvider(RoutingProvider):
    provider_id = "openrouteservice"
    label = "OpenRouteService"
    supports_matrix = True
    supports_waypoint_optimization = False

    def __init__(
        self,
        api_key: str | None,
        settings: OpenRouteServiceSettings | None = None,
        *,
        language: str = "fr",
        before_request: Callable[[], None] | None = None,
        on_success: Callable[[], None] | None = None,
        on_error: Callable[[str], None] | None = None,
    ):
        self.settings = settings or openroute_service_settings
        if not self.settings.enabled:
            raise RoutingError("OpenRouteService est désactivé sur cette instance.", "ROUTING_PROVIDER_UNAVAILABLE")
        if not api_key and not self.settings.allow_unauthenticated:
            raise RoutingError("Aucune clé OpenRouteService personnelle n’est configurée.", "ROUTING_PROVIDER_UNAVAILABLE")
        parts = urlsplit(self.settings.base_url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise RuntimeError("CARTAVAULT_ORS_BASE_URL must be a fixed HTTP(S) service URL")
        self._api_key = api_key
        self.language = language if language in {"fr", "en"} else "en"
        self.before_request = before_request
        self.on_success = on_success
        self.on_error = on_error

    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult:
        self._validate(coordinates, profile)
        payload = self._post(
            f"/v2/directions/{_PROFILES[profile]}/geojson",
            {"coordinates": coordinates, "instructions": True, "language": self.language},
        )
        try:
            feature = payload["features"][0]
            geometry = feature["geometry"]
            properties = feature["properties"]
            summary = properties["summary"]
            raw_segments = properties["segments"]
            segments = [
                {
                    "distance_meters": self._number(segment.get("distance")),
                    "duration_seconds": self._number(segment.get("duration")),
                    "steps": [
                        {
                            "instruction": str(step.get("instruction", "")),
                            "distance_meters": self._number(step.get("distance", 0)),
                            "duration_seconds": self._number(step.get("duration", 0)),
                        }
                        for step in segment.get("steps", []) if isinstance(step, dict)
                    ],
                }
                for segment in raw_segments
            ]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            self._failure("ORS_INVALID_RESPONSE")
            raise RoutingError("OpenRouteService a renvoyé une réponse invalide.", "ORS_INVALID_RESPONSE") from error
        if geometry.get("type") != "LineString" or len(segments) != len(coordinates) - 1:
            self._failure("ORS_INVALID_RESPONSE")
            raise RoutingError("OpenRouteService a renvoyé un itinéraire incohérent.", "ORS_INVALID_RESPONSE")
        result = RouteResult(geometry, self._number(summary.get("distance")), self._number(summary.get("duration")), segments)
        if self.on_success:
            self.on_success()
        return result

    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult:
        self._validate(coordinates, profile)
        payload = self._post(
            f"/v2/matrix/{_PROFILES[profile]}",
            {"locations": coordinates, "metrics": ["distance", "duration"], "resolve_locations": False},
        )
        durations = payload.get("durations")
        distances = payload.get("distances")
        if not self._matrix(durations, len(coordinates)) or not self._matrix(distances, len(coordinates)):
            self._failure("ORS_INVALID_RESPONSE")
            raise RoutingError("OpenRouteService a renvoyé une matrice invalide.", "ORS_INVALID_RESPONSE")
        if self.on_success:
            self.on_success()
        return MatrixResult(durations, distances)

    def _post(self, path: str, payload: dict[str, object]) -> dict:
        if self.before_request:
            self.before_request()
        headers = {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "CartaVault/1"}
        if self._api_key:
            headers["Authorization"] = self._api_key
        request = Request(
            f"{self.settings.base_url}{path}",
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                if response.status != 200:
                    raise RoutingError("OpenRouteService a refusé la requête.", "ORS_PROVIDER_ERROR")
                result = json.loads(response.read(8 * 1024 * 1024))
        except HTTPError as error:
            retry_after = self._retry_after(error.headers.get("Retry-After"))
            if error.code in {401, 403}:
                code, message = "ORS_AUTH_ERROR", "La clé OpenRouteService est invalide ou ne permet pas ce profil."
            elif error.code == 429:
                code, message = "ORS_QUOTA_EXCEEDED", "Le quota OpenRouteService est temporairement dépassé."
            elif error.code in {400, 404}:
                code, message = "ORS_REQUEST_INVALID", "OpenRouteService a refusé les coordonnées ou le profil."
            else:
                code, message = "ORS_PROVIDER_ERROR", "OpenRouteService est temporairement indisponible."
            self._failure(code)
            raise RoutingError(message, code, retry_after=retry_after) from error
        except (TimeoutError, OSError, URLError) as error:
            self._failure("ORS_TIMEOUT")
            raise RoutingError("OpenRouteService n’a pas répondu dans le délai imparti.", "ORS_TIMEOUT") from error
        except json.JSONDecodeError as error:
            self._failure("ORS_INVALID_RESPONSE")
            raise RoutingError("OpenRouteService a renvoyé une réponse invalide.", "ORS_INVALID_RESPONSE") from error
        if not isinstance(result, dict):
            self._failure("ORS_INVALID_RESPONSE")
            raise RoutingError("OpenRouteService a renvoyé une réponse invalide.", "ORS_INVALID_RESPONSE")
        return result

    def _validate(self, coordinates: list[Coordinate], profile: str) -> None:
        if profile not in _PROFILES:
            raise RoutingError("Ce profil n’est pas pris en charge par OpenRouteService.", "ORS_PROFILE_UNSUPPORTED")
        if len(coordinates) < 2:
            raise RoutingError("Au moins deux points sont requis.", "ORS_COORDINATES_INVALID")
        if len(coordinates) > self.settings.max_waypoints:
            raise RoutingError(f"OpenRouteService est limité à {self.settings.max_waypoints} points.", "ORS_WAYPOINT_LIMIT")
        if any(not (math.isfinite(longitude) and math.isfinite(latitude) and -180 <= longitude <= 180 and -90 <= latitude <= 90) for longitude, latitude in coordinates):
            raise RoutingError("Les coordonnées de l’itinéraire sont invalides.", "ORS_COORDINATES_INVALID")

    def _failure(self, code: str) -> None:
        if self.on_error:
            self.on_error(code)

    @staticmethod
    def _number(value: object) -> float:
        number = float(value)
        if not math.isfinite(number) or number < 0:
            raise ValueError
        return number

    @staticmethod
    def _matrix(value: object, size: int) -> bool:
        return isinstance(value, list) and len(value) == size and all(isinstance(row, list) and len(row) == size for row in value)

    @staticmethod
    def _retry_after(value: str | None) -> int | None:
        try:
            return max(1, int(value)) if value else None
        except ValueError:
            return None
