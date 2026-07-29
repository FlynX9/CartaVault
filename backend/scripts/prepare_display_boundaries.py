"""Generate detailed, browser-friendly country masks from Natural Earth 1:10m."""

from __future__ import annotations

import json
import re
from math import hypot
from pathlib import Path
from typing import Any
from urllib.request import urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPOSITORY_ROOT / "backend/app/countries/data/display_boundaries.geojson"
COUNTRY_CATALOG_PATH = REPOSITORY_ROOT / "backend/app/countries/data/countries.json"
COUNTRY_BOUNDS_PATH = REPOSITORY_ROOT / "backend/app/countries/data/country-bounds.json"
SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_10m_admin_0_countries.geojson"
ISO_ALPHA3 = re.compile(r"^[A-Z]{3}$")
# Roughly 40-60 m at mid-latitudes. Leaflet receives nearly all of the source
# detail while exceptionally complex countries remain constrained below.
SIMPLIFICATION_TOLERANCE_DEGREES = 0.0005
MAX_POINTS_PER_COUNTRY = 15_000


def _country_code(properties: dict[str, Any]) -> str | None:
    for field in ("ISO_A3", "ADM0_A3", "iso_a3"):
        value = properties.get(field)
        if isinstance(value, str) and ISO_ALPHA3.fullmatch(value.upper()):
            return value.upper()
    return None


def _point_segment_distance(point: list[float], start: list[float], end: list[float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == dy == 0:
        return hypot(point[0] - start[0], point[1] - start[1])
    ratio = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
    return hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy))


def _simplify_line(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    farthest_index = 0
    farthest_distance = 0.0
    for index, point in enumerate(points[1:-1], start=1):
        distance = _point_segment_distance(point, start, end)
        if distance > farthest_distance:
            farthest_index, farthest_distance = index, distance
    if farthest_distance <= tolerance:
        return [start, end]
    left = _simplify_line(points[: farthest_index + 1], tolerance)
    right = _simplify_line(points[farthest_index:], tolerance)
    return left[:-1] + right


def _simplify_ring(
    ring: list[list[float]],
    tolerance: float = SIMPLIFICATION_TOLERANCE_DEGREES,
) -> list[list[float]]:
    if len(ring) < 5:
        return ring
    open_ring = ring[:-1] if ring[0][:2] == ring[-1][:2] else ring
    # Rotate a closed ring around a stable, distant pair so Douglas-Peucker
    # does not collapse it against two identical endpoints.
    anchor = min(range(len(open_ring)), key=lambda index: (open_ring[index][0], open_ring[index][1]))
    rotated = open_ring[anchor:] + open_ring[:anchor]
    opposite = max(
        range(1, len(rotated)),
        key=lambda index: hypot(rotated[index][0] - rotated[0][0], rotated[index][1] - rotated[0][1]),
    )
    simplified = (
        _simplify_line(rotated[: opposite + 1], tolerance)[:-1]
        + _simplify_line(rotated[opposite:] + [rotated[0]], tolerance)
    )
    return simplified if len(simplified) >= 4 else ring


def _geometry_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "Polygon" and isinstance(coordinates, list):
        return [[_simplify_ring(ring) for ring in coordinates]]
    if geometry.get("type") == "MultiPolygon" and isinstance(coordinates, list):
        return [[_simplify_ring(ring) for ring in polygon] for polygon in coordinates]
    return []


def _point_count(polygons: list[list[list[list[float]]]]) -> int:
    return sum(len(ring) for polygon in polygons for ring in polygon)


def _enforce_country_budget(polygons: list[list[list[list[float]]]]) -> list[list[list[list[float]]]]:
    """Increase simplification only for exceptionally complex coastlines."""

    tolerance = SIMPLIFICATION_TOLERANCE_DEGREES
    result = polygons
    while _point_count(result) > MAX_POINTS_PER_COUNTRY:
        tolerance *= 1.5
        result = [[_simplify_ring(ring, tolerance) for ring in polygon] for polygon in polygons]
    return result


def main() -> None:
    with urlopen(SOURCE_URL, timeout=120) as response:  # noqa: S310 - pinned public dataset
        source = json.load(response)
    countries: dict[str, list[list[list[list[float]]]]] = {}
    for feature in source.get("features", []):
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        country_code = _country_code(properties)
        polygons = _geometry_polygons(geometry)
        if country_code and polygons:
            countries.setdefault(country_code, []).extend(polygons)

    country_catalog = json.loads(COUNTRY_CATALOG_PATH.read_text(encoding="utf-8"))["countries"]
    primary_country_codes = set(json.loads(COUNTRY_BOUNDS_PATH.read_text(encoding="utf-8")))
    expected_codes = {
        country["iso_alpha3"]
        for country in country_catalog
        if country["iso_alpha2"] in primary_country_codes
    }
    missing_codes = sorted(expected_codes - countries.keys())
    if missing_codes:
        raise RuntimeError(f"Natural Earth source misses primary CartaVault countries: {', '.join(missing_codes)}")
    countries = {code: _enforce_country_budget(polygons) for code, polygons in countries.items()}

    payload = {
        "type": "FeatureCollection",
        "name": "CartaVault display boundaries",
        "license": "Natural Earth public domain, 1:10m cultural vectors",
        "source": "https://www.naturalearthdata.com/",
        "simplification_tolerance_degrees": SIMPLIFICATION_TOLERANCE_DEGREES,
        "maximum_points_per_country": MAX_POINTS_PER_COUNTRY,
        "features": [
            {
                "type": "Feature",
                "properties": {"iso_a3": code},
                "geometry": {"type": "MultiPolygon", "coordinates": countries[code]},
            }
            for code in sorted(countries)
        ],
    }
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(countries)} detailed country boundaries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
