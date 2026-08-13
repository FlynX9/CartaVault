"""Load zoom-specific country geometries used exclusively by visual map masks."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zipfile import ZipFile

from app.trips.routing.country_validator import CountryBoundaries


DisplayBoundaryDetail = Literal["low", "medium", "high"]
DISPLAY_BOUNDARY_DETAILS: tuple[DisplayBoundaryDetail, ...] = ("low", "medium", "high")


def _archive_path(detail: DisplayBoundaryDetail) -> Path:
    return Path(__file__).parent / "data" / f"display_boundaries_{detail}.zip"


@lru_cache(maxsize=512)
def load_display_boundary(country_code: str, detail: DisplayBoundaryDetail = "medium") -> list[list[list[list[float]]]] | None:
    """Load and cache one country instead of expanding a worldwide catalog."""

    if detail not in DISPLAY_BOUNDARY_DETAILS:
        raise ValueError(f"Unsupported display boundary detail: {detail}")
    member = f"boundaries/{country_code.upper()}.json"
    try:
        with ZipFile(_archive_path(detail)) as archive:
            return json.loads(archive.read(member))["coordinates"]
    except KeyError:
        return None


def load_display_boundaries(detail: DisplayBoundaryDetail = "medium") -> CountryBoundaries:
    """Load a complete tier for offline jobs and integrity tests."""

    if detail not in DISPLAY_BOUNDARY_DETAILS:
        raise ValueError(f"Unsupported display boundary detail: {detail}")
    with ZipFile(_archive_path(detail)) as archive:
        country_codes = json.loads(archive.read("manifest.json"))["country_codes"]
    return {
        code: boundary
        for code in country_codes
        if (boundary := load_display_boundary(code, detail)) is not None
    }
