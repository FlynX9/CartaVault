"""Load the versioned country catalogue shared by migrations and tooling."""

import json
from functools import lru_cache
from pathlib import Path
from uuid import UUID, uuid5


CATALOG_NAMESPACE = UUID("e66daaad-42e3-5b64-8cbc-89cd5f971704")
CATALOG_PATH = Path(__file__).parent / "data" / "countries.json"
COUNTRY_BOUNDS_PATH = Path(__file__).parent / "data" / "country-bounds.json"


@lru_cache(maxsize=1)
def load_country_catalog() -> tuple[dict[str, object], ...]:
    """Return validated records with deterministic UUIDs."""

    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    records: list[dict[str, object]] = []

    for country in payload["countries"]:
        iso_alpha3 = country["iso_alpha3"]
        records.append(
            {
                "id": uuid5(CATALOG_NAMESPACE, iso_alpha3),
                **country,
            }
        )

    return tuple(records)


@lru_cache(maxsize=1)
def load_country_bounds() -> dict[str, tuple[float, float, float, float]]:
    """Return primary-territory bounds keyed by ISO alpha-2 code.

    Values use the ``west, south, east, north`` order from the source file.
    """

    payload = json.loads(COUNTRY_BOUNDS_PATH.read_text(encoding="utf-8"))
    return {
        iso_alpha2: tuple(float(value) for value in bounds)
        for iso_alpha2, bounds in payload.items()
    }
