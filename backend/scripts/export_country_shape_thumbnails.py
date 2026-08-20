"""Export CartaVault's existing offline boundaries for static card thumbnails.

The frontend catalogue deliberately prefers the compact Natural Earth routing
geometry and only falls back to the low-detail display boundary archive for
territories absent from that dataset. This is an offline build step: card
thumbnails never request geometry or map tiles at runtime.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DATA_DIRECTORY = REPOSITORY_ROOT / "backend/app/countries/data"
ROUTING_BOUNDARIES_PATH = DATA_DIRECTORY / "routing_boundaries.geojson"
DISPLAY_BOUNDARIES_PATH = DATA_DIRECTORY / "display_boundaries_low.zip"
OUTPUT_PATH = REPOSITORY_ROOT / "frontend/src/components/maps/countryShapeData.generated.json"


def _as_multi_polygon(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list):
        return []
    if geometry.get("type") == "Polygon":
        return [coordinates]
    if geometry.get("type") == "MultiPolygon":
        return coordinates
    return []


def main() -> None:
    routing = json.loads(ROUTING_BOUNDARIES_PATH.read_text(encoding="utf-8"))
    geometries: dict[str, list[list[list[list[float]]]]] = {}
    sources: dict[str, str] = {}
    for feature in routing["features"]:
        code = feature.get("properties", {}).get("iso_a3")
        polygons = _as_multi_polygon(feature.get("geometry", {}))
        if isinstance(code, str) and polygons:
            geometries[code] = polygons
            sources[code] = "Natural Earth 1:110m"

    with ZipFile(DISPLAY_BOUNDARIES_PATH) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        for member in archive.namelist():
            if not member.startswith("boundaries/") or not member.endswith(".json"):
                continue
            code = Path(member).stem
            if code in geometries:
                continue
            boundary = json.loads(archive.read(member))
            polygons = _as_multi_polygon(boundary)
            if polygons:
                geometries[code] = polygons
                sources[code] = boundary.get("source", "CartaVault display boundary")

    payload = {
        "metadata": {
            "generatedFrom": [ROUTING_BOUNDARIES_PATH.name, DISPLAY_BOUNDARIES_PATH.name],
            "license": manifest["license"],
            "naturalEarthLicense": "Public domain",
            "countryCount": len(geometries),
            "note": "Generated offline; no thumbnail runtime network dependency.",
        },
        "geometries": {code: geometries[code] for code in sorted(geometries)},
        "sources": {code: sources[code] for code in sorted(sources)},
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(geometries)} static thumbnail geometries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
