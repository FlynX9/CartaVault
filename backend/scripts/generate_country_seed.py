"""Regenerate the Docker SQL seed from the single JSON catalogue source."""

import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPOSITORY_ROOT / "backend/app/countries/data/countries.json"
SEED_PATH = REPOSITORY_ROOT / "database/init/002_country_catalog.sql"


def main() -> None:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    source = payload["source"]
    lines = [
        "-- Generated from backend/app/countries/data/countries.json. Do not edit by hand.",
        f"-- Source: {source['name']} @ {source['revision']} ({source['license']}).",
        "",
        "INSERT INTO countries (iso_alpha2, iso_alpha3, name, center_latitude, center_longitude, default_zoom) VALUES",
    ]
    countries = payload["countries"]
    for index, country in enumerate(countries):
        name = country["name"].replace("'", "''")
        suffix = ";" if index == len(countries) - 1 else ","
        lines.append(
            f"('{country['iso_alpha2']}', '{country['iso_alpha3']}', "
            f"'{name}', {country['center_latitude']}, "
            f"{country['center_longitude']}, {country['default_zoom']}){suffix}"
        )
    SEED_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
