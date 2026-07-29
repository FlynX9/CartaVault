"""Load the detailed country geometry used exclusively by visual map masks."""

import json
from functools import lru_cache
from pathlib import Path

from app.trips.routing.country_validator import CountryBoundaries


@lru_cache(maxsize=1)
def load_display_boundaries() -> CountryBoundaries:
    path = Path(__file__).parent / "data" / "display_boundaries.geojson"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        feature["properties"]["iso_a3"]: feature["geometry"]["coordinates"]
        for feature in payload.get("features", [])
        if feature.get("geometry", {}).get("type") == "MultiPolygon"
    }
