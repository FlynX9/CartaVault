from __future__ import annotations

from app.trips.routing.base import Coordinate, MatrixResult, RouteResult, RoutingError, RoutingProvider


_FALLBACK_CODES = {
    "ROUTING_PROVIDER_UNAVAILABLE",
    "ORS_AUTH_ERROR",
    "ORS_QUOTA_EXCEEDED",
    "ORS_PROVIDER_ERROR",
    "ORS_TIMEOUT",
    "ORS_INVALID_RESPONSE",
    "ORS_LOCAL_RATE_LIMITED",
}


class FallbackRoutingProvider(RoutingProvider):
    """Use the secondary provider only for safe availability failures."""

    def __init__(self, primary: RoutingProvider, secondary: RoutingProvider):
        self.primary = primary
        self.secondary = secondary
        self.provider_id = primary.provider_id
        self.label = primary.label
        self.supports_route = primary.supports_route
        self.supports_matrix = primary.supports_matrix and secondary.supports_matrix
        self.supports_waypoint_optimization = primary.supports_waypoint_optimization
        self.last_provider_id = primary.provider_id
        self.fallback_reason: str | None = None

    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult:
        try:
            result = self.primary.calculate_route(coordinates, profile)
            self.last_provider_id = self.primary.provider_id
            self.fallback_reason = None
            return result
        except RoutingError as error:
            if error.code not in _FALLBACK_CODES:
                raise
            self.last_provider_id = self.secondary.provider_id
            self.fallback_reason = error.code
            return self.secondary.calculate_route(coordinates, profile)

    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult:
        try:
            result = self.primary.calculate_matrix(coordinates, profile)
            self.last_provider_id = self.primary.provider_id
            self.fallback_reason = None
            return result
        except RoutingError as error:
            if error.code not in _FALLBACK_CODES:
                raise
            self.last_provider_id = self.secondary.provider_id
            self.fallback_reason = error.code
            return self.secondary.calculate_matrix(coordinates, profile)
