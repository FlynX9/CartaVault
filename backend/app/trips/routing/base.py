from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

Coordinate = tuple[float, float]  # longitude, latitude


class RoutingError(RuntimeError):
    def __init__(self, message: str, code: str = "ROUTING_PROVIDER_ERROR"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class RoutingConstraints:
    stay_in_country: bool = False
    country_code: str | None = None


@dataclass(frozen=True)
class RouteResult:
    geometry: dict
    distance_meters: float
    duration_seconds: float
    segments: list[dict]


@dataclass(frozen=True)
class MatrixResult:
    durations: list[list[float | None]]
    distances: list[list[float | None]]


class RoutingProvider(ABC):
    # Third-party/test providers written before provider selection represented
    # the legacy OSRM engine. Keeping this default preserves that contract.
    provider_id = "osrm"
    label = "OSRM"
    supports_route = True
    supports_matrix = True
    supports_waypoint_optimization = False
    supports_country_restriction = False

    @abstractmethod
    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult: ...

    @abstractmethod
    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult: ...

    def optimize_waypoint_order(self, coordinates: list[Coordinate], profile: str = "driving") -> list[int]:
        raise RoutingError("This routing provider does not support waypoint optimization", "ROUTING_CAPABILITY_UNAVAILABLE")
