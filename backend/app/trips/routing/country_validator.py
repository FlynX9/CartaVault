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
from typing import Any, TypeAlias

from app.config import routing_settings


@dataclass(frozen=True)
class CountryRouteValidation:
    is_valid: bool
    country_code: str
    outside_distance_meters: float = 0
    outside_segment_count: int = 0
    first_exit_coordinate: dict[str, float] | None = None
    reason: str | None = None


Ring: TypeAlias = list[list[float]]
Polygon: TypeAlias = list[Ring]
CountryBoundaries: TypeAlias = dict[str, list[Polygon]]


class CountryRouteValidator:
    """Validate every sufficiently dense point of an OSRM LineString."""

    def __init__(self, boundaries: CountryBoundaries | dict[str, list[Ring]] | None = None, *, tolerance_meters: int | None = None, max_outside_distance_meters: int | None = None):
        self.boundaries = boundaries if boundaries is not None else load_boundaries()
        # The embedded production dataset intentionally favours a compact
        # footprint.  Its low-resolution borders can leave small gaps or
        # differ from road geometry near a frontier, so only a point that is
        # also inside a different country is a confirmed country exit.
        self._confirm_foreign_country = boundaries is None
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
            if outside and self._confirm_foreign_country:
                outside = _containing_foreign_country(point, self.boundaries, country_code) is not None
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
def load_boundaries() -> CountryBoundaries:
    path = Path(__file__).parents[2] / "countries" / "data" / "routing_boundaries.geojson"
    payload = json.loads(path.read_text(encoding="utf-8"))
    boundaries: CountryBoundaries = {}
    for feature in payload.get("features", []):
        properties = feature.get("properties", {})
        code = properties.get("iso_a3") or properties.get("ISO_A3") or properties.get("ADM0_A3")
        geometry = feature.get("geometry", {})
        if not isinstance(code, str) or len(code) != 3 or not code.isalpha():
            continue
        if geometry.get("type") == "Polygon":
            boundaries[code.upper()] = [geometry.get("coordinates", [])]
        elif geometry.get("type") == "MultiPolygon":
            boundaries[code.upper()] = geometry.get("coordinates", [])
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


def _inside_any(point: list[float], polygons: list[Polygon] | list[Ring]) -> bool:
    normalized = _normalize_polygons(polygons)
    return any(_inside_polygon(point, polygon) for polygon in normalized)


def _containing_foreign_country(point: list[float], boundaries: CountryBoundaries, country_code: str) -> str | None:
    """Return the foreign country containing a point, when known locally.

    A low-resolution local outline alone is not enough evidence that a route
    left its country: it can be a simplification gap.  A positive match in a
    neighbouring country outline is reliable evidence and keeps the constraint
    effective for real cross-border routes.
    """

    expected = country_code.upper()
    for code, polygons in boundaries.items():
        if code.upper() != expected and _inside_any(point, polygons):
            return code.upper()
    return None


def _normalize_polygons(polygons: list[Polygon] | list[Ring]) -> list[Polygon]:
    """Accept legacy flat rings in tests while retaining polygon holes in data."""

    if not polygons:
        return []
    first = polygons[0]
    if first and isinstance(first[0], list) and first[0] and isinstance(first[0][0], (int, float)):
        return [[ring] for ring in polygons]  # legacy outer rings
    return polygons  # type: ignore[return-value]


def _inside_polygon(point: list[float], polygon: Polygon) -> bool:
    if not polygon or not _inside_ring(point, polygon[0]):
        return False
    return not any(_inside_ring(point, hole) for hole in polygon[1:])


def _inside_ring(point: list[float], ring: list[list[float]]) -> bool:
    if len(ring) < 3:
        return False
    x, y = point[:2]; inside = False
    for first, second in zip(ring, ring[1:] + ring[:1]):
        x1, y1 = first[:2]; x2, y2 = second[:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _distance_to_polygons_meters(point: list[float], polygons: list[Polygon] | list[Ring]) -> float:
    return min(_distance_to_segment_meters(point, start, end) for polygon in _normalize_polygons(polygons) for ring in polygon for start, end in zip(ring, ring[1:] + ring[:1]))


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
