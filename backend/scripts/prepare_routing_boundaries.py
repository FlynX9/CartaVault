"""Build CartaVault's runtime country-boundary dataset from Natural Earth.

The resulting file intentionally retains only the ISO code and geometry needed
for offline routing validation. It must be regenerated from a pinned Natural
Earth release whenever its source data changes.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.request import urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = REPOSITORY_ROOT / "backend/app/countries/data/ne_110m_admin_0_countries.geojson"
OUTPUT_PATH = REPOSITORY_ROOT / "backend/app/countries/data/routing_boundaries.geojson"
COUNTRY_CATALOG_PATH = REPOSITORY_ROOT / "backend/app/countries/data/countries.json"
COUNTRY_BOUNDS_PATH = REPOSITORY_ROOT / "backend/app/countries/data/country-bounds.json"
SOURCE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
ISO_ALPHA3 = re.compile(r"^[A-Z]{3}$")


def _country_code(properties: dict[str, Any]) -> str | None:
    for field in ("ISO_A3", "ADM0_A3", "iso_a3"):
        value = properties.get(field)
        if isinstance(value, str) and ISO_ALPHA3.fullmatch(value.upper()):
            return value.upper()
    return None


def main() -> None:
    if SOURCE_PATH.exists():
        source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    else:
        with urlopen(SOURCE_URL, timeout=60) as response:  # noqa: S310 - fixed public data source
            source = json.load(response)
    countries: dict[str, dict[str, Any]] = {}

    for feature in source.get("features", []):
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        country_code = _country_code(properties)
        if country_code is None:
            continue
        countries[country_code] = {
            "type": "Feature",
            "properties": {"iso_a3": country_code},
            "geometry": geometry,
        }

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

    payload = {
        "type": "FeatureCollection",
        "name": "CartaVault routing boundaries",
        "license": "Natural Earth public domain, 1:110m cultural vectors",
        "source": "https://www.naturalearthdata.com/",
        "features": [countries[code] for code in sorted(countries)],
    }
    OUTPUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(countries)} country boundaries to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
