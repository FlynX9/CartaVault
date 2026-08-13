"""Build multi-resolution visual country masks from OpenStreetMap boundaries.

The resulting catalog is deliberately separate from the compact Natural Earth
dataset used to validate routes. Network access is required only when this
build-time script is run; CartaVault never contacts a boundary provider at
runtime.
"""

from __future__ import annotations

import bz2
import json
import re
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZIP_DEFLATED, ZipFile

from shapely.geometry import mapping, shape


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DATA_DIRECTORY = REPOSITORY_ROOT / "backend/app/countries/data"
COUNTRY_CATALOG_PATH = DATA_DIRECTORY / "countries.json"
OSM_COUNTRY_CATALOG_URL = "https://openstreetdata.org/countries.json"
OSM_BOUNDARY_URL = "https://files.openstreetdata.org/extracts/{iso_alpha2}-borders.geojson.bz2"
NATURAL_EARTH_FALLBACK_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_10m_admin_0_countries.geojson"
USER_AGENT = "CartaVault-boundary-builder/1.0 (offline dataset preparation)"
ISO_ALPHA3 = re.compile(r"^[A-Z]{3}$")

# Tolerances are expressed in WGS84 degrees. The high tier remains precise
# enough for close map views while the lower tiers keep payloads inexpensive.
DETAIL_TIERS = {
    "low": {"tolerance": 0.02, "maximum_points": 3_000},
    "medium": {"tolerance": 0.002, "maximum_points": 12_000},
    "high": {"tolerance": 0.0002, "maximum_points": 30_000},
}


def _download(url: str, *, attempts: int = 3) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=120) as response:  # noqa: S310 - fixed public sources
                return response.read()
        except (HTTPError, URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("Unreachable download retry state")


def _country_code(properties: dict[str, Any]) -> str | None:
    for field in ("ISO_A3", "ADM0_A3", "iso_a3"):
        value = properties.get(field)
        if isinstance(value, str) and ISO_ALPHA3.fullmatch(value.upper()):
            return value.upper()
    return None


def _raw_geometry_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, (list, tuple)):
        return []
    normalized = json.loads(json.dumps(coordinates))
    if geometry.get("type") == "Polygon":
        return [normalized]
    if geometry.get("type") == "MultiPolygon":
        return normalized
    return []


def _point_count(polygons: list[list[list[list[float]]]]) -> int:
    return sum(len(ring) for polygon in polygons for ring in polygon)


def _simplify_polygons(polygons: list[list[list[list[float]]]], tolerance: float, maximum_points: int) -> list[list[list[list[float]]]]:
    geometry = shape({"type": "MultiPolygon", "coordinates": polygons})
    simplified = geometry.simplify(tolerance, preserve_topology=True)
    result = _raw_geometry_polygons(mapping(simplified))
    while _point_count(result) > maximum_points:
        tolerance *= 1.5
        simplified = geometry.simplify(tolerance, preserve_topology=True)
        result = _raw_geometry_polygons(mapping(simplified))
    return result


def _natural_earth_fallback() -> dict[str, list[list[list[list[float]]]]]:
    source = json.loads(_download(NATURAL_EARTH_FALLBACK_URL))
    countries: dict[str, list[list[list[list[float]]]]] = {}
    for feature in source.get("features", []):
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        code = _country_code(properties)
        polygons = _raw_geometry_polygons(geometry)
        if code and polygons:
            countries.setdefault(code, []).extend(polygons)
    return countries


def _osm_boundaries(alpha2_to_alpha3: dict[str, str]) -> dict[str, list[list[list[list[float]]]]]:
    available = {entry["code"] for entry in json.loads(_download(OSM_COUNTRY_CATALOG_URL)) if isinstance(entry, dict) and isinstance(entry.get("code"), str)}
    countries: dict[str, list[list[list[list[float]]]]] = {}
    for index, (alpha2, alpha3) in enumerate(sorted(alpha2_to_alpha3.items()), start=1):
        if alpha2 not in available:
            continue
        try:
            payload = json.loads(bz2.decompress(_download(OSM_BOUNDARY_URL.format(iso_alpha2=alpha2))))
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            print(f"[{index}/{len(alpha2_to_alpha3)}] {alpha2}: OSM boundary unavailable ({error})")
            continue
        polygons: list[list[list[list[float]]]] = []
        for feature in payload.get("features", []):
            geometry = feature.get("geometry")
            if isinstance(geometry, dict):
                polygons.extend(_raw_geometry_polygons(geometry))
        if polygons:
            countries[alpha3] = polygons
            print(f"[{index}/{len(alpha2_to_alpha3)}] {alpha2}: {_point_count(polygons):,} OSM points")
    return countries


def main() -> None:
    catalog = json.loads(COUNTRY_CATALOG_PATH.read_text(encoding="utf-8"))["countries"]
    alpha2_to_alpha3 = {country["iso_alpha2"]: country["iso_alpha3"] for country in catalog}
    natural_earth = _natural_earth_fallback()
    osm = _osm_boundaries(alpha2_to_alpha3)
    raw = {alpha3: osm.get(alpha3, natural_earth.get(alpha3, [])) for alpha3 in alpha2_to_alpha3.values()}
    missing = sorted(code for code, polygons in raw.items() if not polygons)
    if missing:
        print(f"Warning: no standalone display boundary is available for: {', '.join(missing)}")
    raw = {code: polygons for code, polygons in raw.items() if polygons}

    for detail, configuration in DETAIL_TIERS.items():
        boundaries: dict[str, dict[str, Any]] = {}
        for code in sorted(raw):
            polygons = _simplify_polygons(raw[code], configuration["tolerance"], configuration["maximum_points"])
            boundaries[code] = {"type": "MultiPolygon", "coordinates": polygons, "source": "OpenStreetMap" if code in osm else "Natural Earth fallback"}
        manifest = {
            "name": f"CartaVault {detail} display boundaries",
            "license": "OpenStreetMap contributors, ODbL 1.0; Natural Earth public-domain fallback",
            "sources": ["https://openstreetdata.org/", "https://www.openstreetmap.org/", "https://www.naturalearthdata.com/"],
            "detail": detail,
            "simplification_tolerance_degrees": configuration["tolerance"],
            "maximum_points_per_country": configuration["maximum_points"],
            "osm_country_count": len(osm),
            "country_codes": sorted(boundaries),
        }
        output_path = DATA_DIRECTORY / f"display_boundaries_{detail}.zip"
        with ZipFile(output_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":"), ensure_ascii=False))
            for code, boundary in boundaries.items():
                archive.writestr(f"boundaries/{code}.json", json.dumps(boundary, separators=(",", ":"), ensure_ascii=False))
        print(f"Wrote {len(boundaries)} {detail} boundaries to {output_path}")


if __name__ == "__main__":
    main()
