from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

Coordinate = tuple[float, float]  # longitude, latitude


class RoutingError(RuntimeError):
    pass


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
    @abstractmethod
    def calculate_route(self, coordinates: list[Coordinate], profile: str = "driving") -> RouteResult: ...

    @abstractmethod
    def calculate_matrix(self, coordinates: list[Coordinate], profile: str = "driving") -> MatrixResult: ...
