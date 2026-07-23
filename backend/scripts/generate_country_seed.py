"""Regenerate the Docker SQL seed from the single JSON catalogue source."""

import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPOSITORY_ROOT / "backend/app/countries/data/countries.json"
COUNTRY_BOUNDS_PATH = REPOSITORY_ROOT / "backend/app/countries/data/country-bounds.json"
SEED_PATH = REPOSITORY_ROOT / "database/init/002_country_catalog.sql"


def main() -> None:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    country_bounds = json.loads(COUNTRY_BOUNDS_PATH.read_text(encoding="utf-8"))
    source = payload["source"]
    lines = [
        "-- Generated from backend/app/countries/data/countries.json. Do not edit by hand.",
        f"-- Source: {source['name']} @ {source['revision']} ({source['license']}).",
        "-- Bounds: sandstrom/country-bounding-boxes @ 8c9367f4e4495deee65d3d49d0cad68afc950150 (Unlicense).",
        "",
        "INSERT INTO countries (iso_alpha2, iso_alpha3, name, center_latitude, center_longitude, default_zoom, min_latitude, max_latitude, min_longitude, max_longitude) VALUES",
    ]
    countries = payload["countries"]
    for index, country in enumerate(countries):
        name = country["name"].replace("'", "''")
        bounds = country_bounds.get(country["iso_alpha2"])
        min_longitude, min_latitude, max_longitude, max_latitude = (
            bounds if bounds is not None else ("NULL", "NULL", "NULL", "NULL")
        )
        suffix = ";" if index == len(countries) - 1 else ","
        lines.append(
            f"('{country['iso_alpha2']}', '{country['iso_alpha3']}', "
            f"'{name}', {country['center_latitude']}, "
            f"{country['center_longitude']}, {country['default_zoom']}, "
            f"{min_latitude}, {max_latitude}, {min_longitude}, {max_longitude}){suffix}"
        )
    SEED_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
