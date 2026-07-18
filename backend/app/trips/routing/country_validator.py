"""Local post-routing country validation.

OSRM's public service has no polygon exclusion option.  Routes are therefore
validated *after* they are returned and are never persisted when rejected.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from math import cos, hypot, radians
from pathlib import Path
from typing import Any

from app.config import routing_settings


@dataclass(frozen=True)
class CountryRouteValidation:
    is_valid: bool
    country_code: str
    outside_distance_meters: float = 0
    outside_segment_count: int = 0
    first_exit_coordinate: dict[str, float] | None = None
    reason: str | None = None


class CountryRouteValidator:
    """Validate every sufficiently dense point of an OSRM LineString."""

    def __init__(self, boundaries: dict[str, list[list[list[float]]]] | None = None, *, tolerance_meters: int | None = None, max_outside_distance_meters: int | None = None):
        self.boundaries = boundaries if boundaries is not None else load_boundaries()
        self.tolerance_meters = routing_settings.country_boundary_tolerance_meters if tolerance_meters is None else tolerance_meters
        self.max_outside_distance_meters = routing_settings.max_outside_distance_meters if max_outside_distance_meters is None else max_outside_distance_meters

    def validate_route_within_country(self, geometry: dict[str, Any] | None, country_code: str) -> CountryRouteValidation:
        polygons = self.boundaries.get(country_code.upper())
        if not polygons:
            return CountryRouteValidation(False, country_code.upper(), reason="boundary_unavailable")
        coordinates = geometry.get("coordinates") if isinstance(geometry, dict) and geometry.get("type") == "LineString" else None
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            return CountryRouteValidation(False, country_code.upper(), reason="invalid_geometry")
        samples = _densify(coordinates)
        outside_distance = 0.0
        segments = 0
        first_exit: dict[str, float] | None = None
        was_outside = False
        for index, point in enumerate(samples):
            if not _valid_coordinate(point):
                return CountryRouteValidation(False, country_code.upper(), reason="invalid_geometry")
            inside = _inside_any(point, polygons)
            close_to_border = _distance_to_polygons_meters(point, polygons) <= self.tolerance_meters
            outside = not inside and not close_to_border
            if outside:
                if first_exit is None:
                    first_exit = {"longitude": float(point[0]), "latitude": float(point[1])}
                if not was_outside:
                    segments += 1
                if index:
                    outside_distance += _distance_meters(samples[index - 1], point)
            was_outside = outside
        return CountryRouteValidation(
            outside_distance <= self.max_outside_distance_meters,
            country_code.upper(),
            outside_distance,
            segments,
            first_exit,
            None if outside_distance <= self.max_outside_distance_meters else "route_leaves_country",
        )


@lru_cache(maxsize=1)
def load_boundaries() -> dict[str, list[list[list[float]]]]:
    path = Path(__file__).parents[2] / "countries" / "data" / "routing_boundaries.geojson"
    payload = json.loads(path.read_text(encoding="utf-8"))
    boundaries: dict[str, list[list[list[float]]]] = {}
    for feature in payload.get("features", []):
        code = feature.get("properties", {}).get("iso_a3")
        geometry = feature.get("geometry", {})
        if not isinstance(code, str):
            continue
        if geometry.get("type") == "Polygon":
            boundaries[code] = geometry.get("coordinates", [])
        elif geometry.get("type") == "MultiPolygon":
            boundaries[code] = [ring for polygon in geometry.get("coordinates", []) for ring in polygon]
    return boundaries


def _valid_coordinate(point: object) -> bool:
    return isinstance(point, list) and len(point) >= 2 and isinstance(point[0], (int, float)) and isinstance(point[1], (int, float)) and -180 <= point[0] <= 180 and -90 <= point[1] <= 90


def _densify(coordinates: list[list[float]], max_step_meters: float = 100) -> list[list[float]]:
    result: list[list[float]] = []
    for start, end in zip(coordinates, coordinates[1:]):
        if not _valid_coordinate(start) or not _valid_coordinate(end):
            return [start]
        steps = max(1, round(_distance_meters(start, end) / max_step_meters))
        result.extend([[start[0] + (end[0] - start[0]) * index / steps, start[1] + (end[1] - start[1]) * index / steps] for index in range(steps)])
    result.append(coordinates[-1])
    return result


def _inside_any(point: list[float], rings: list[list[list[float]]]) -> bool:
    return any(_inside_ring(point, ring) for ring in rings)


def _inside_ring(point: list[float], ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    x, y = point[:2]; inside = False
    for first, second in zip(ring, ring[1:] + ring[:1]):
        x1, y1 = first[:2]; x2, y2 = second[:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _distance_to_polygons_meters(point: list[float], rings: list[list[list[float]]]) -> float:
    return min(_distance_to_segment_meters(point, start, end) for ring in rings for start, end in zip(ring, ring[1:] + ring[:1]))


def _distance_to_segment_meters(point: list[float], start: list[float], end: list[float]) -> float:
    scale_x = 111_320 * cos(radians(point[1])); scale_y = 110_540
    px, py = point[0] * scale_x, point[1] * scale_y
    sx, sy = start[0] * scale_x, start[1] * scale_y; ex, ey = end[0] * scale_x, end[1] * scale_y
    dx, dy = ex - sx, ey - sy
    ratio = 0 if dx == dy == 0 else max(0, min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
    return hypot(px - (sx + ratio * dx), py - (sy + ratio * dy))


def _distance_meters(first: list[float], second: list[float]) -> float:
    scale_x = 111_320 * cos(radians((first[1] + second[1]) / 2)); scale_y = 110_540
    return hypot((second[0] - first[0]) * scale_x, (second[1] - first[1]) * scale_y)
