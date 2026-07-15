"""Explicit KMZ-to-Place field mapping with lossless custom fields."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable


PLACE_FIELD_ALIASES = {
    "name": {"name", "nom", "title", "titre"},
    "description": {"description", "desc"},
    "region": {"region", "region"},
    "construction_date": {"construction_date", "construction", "date_construction"},
    "abandonment_date": {"abandonment_date", "abandonment", "date_abandon"},
    "condition": {"condition", "etat"},
    "access": {"access", "acces"},
    "danger_level": {"danger", "danger_level", "niveau_danger"},
}


def normalize_field_name(value: str) -> str:
    """Normalize aliases without changing the original custom-field key."""

    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return "_".join(part for part in normalized.lower().replace("-", " ").split() if part)


def map_extended_data(
    fields: Iterable[tuple[str, str]],
    *,
    name: str | None,
    description: str | None,
) -> tuple[dict[str, str], dict[str, str | list[str]]]:
    """Return recognized place values and all remaining textual fields.

    Repeated unknown names are retained as a list in their discovery order.
    The first recognized value wins, making collisions deterministic.
    """

    aliases = {
        alias: target
        for target, values in PLACE_FIELD_ALIASES.items()
        for alias in values
    }
    mapped: dict[str, str] = {}
    if name:
        mapped["name"] = name
    if description:
        mapped["description"] = description

    custom_fields: dict[str, str | list[str]] = {}
    for original_name, raw_value in fields:
        value = raw_value.strip()
        if not original_name or not value:
            continue
        previous = custom_fields.get(original_name)
        if previous is None:
            custom_fields[original_name] = value
        elif isinstance(previous, list):
            previous.append(value)
        else:
            custom_fields[original_name] = [previous, value]
        target = aliases.get(normalize_field_name(original_name))
        if target is not None and target not in mapped:
            mapped[target] = value

    return mapped, custom_fields
