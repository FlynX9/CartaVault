"""Strict loader for the shared starter-profile definitions."""

import json
from pathlib import Path
from typing import Any

from app.categories.icon_catalog import is_allowed_category_icon
from app.colors import HEX_COLOR_PATTERN
from app.map_profiles.schemas import StarterProfileRead


CATALOG_PATH = Path(__file__).resolve().parents[3] / "shared" / "map-starter-profiles.json"
EXPECTED_PROFILE_IDS = (
    "general", "urbex", "photography", "tourism", "hiking",
    "heritage", "road_trip", "gastronomy", "custom",
)


def _localized(raw: object, context: str) -> dict[str, str]:
    if not isinstance(raw, dict) or set(raw) != {"fr", "en"}:
        raise ValueError(f"{context} must contain exactly fr and en")
    values = {locale: value.strip() for locale, value in raw.items() if isinstance(value, str)}
    if set(values) != {"fr", "en"} or not all(values.values()):
        raise ValueError(f"{context} translations must be non-empty strings")
    return values


def _validate_resources(profile: dict[str, Any], kind: str) -> None:
    resources = profile.get(kind)
    if not isinstance(resources, list):
        raise ValueError(f"Profile {profile['id']} {kind} must be a list")
    keys: set[str] = set()
    localized_names = {"fr": set(), "en": set()}
    previous_order = -1
    for index, resource in enumerate(resources):
        context = f"Profile {profile['id']} {kind}[{index}]"
        if not isinstance(resource, dict):
            raise ValueError(f"{context} must be an object")
        key = resource.get("key")
        if not isinstance(key, str) or not key or key in keys:
            raise ValueError(f"{context} has an invalid or duplicate key")
        keys.add(key)
        names = _localized(resource.get("name"), f"{context} name")
        for locale, name in names.items():
            normalized = name.casefold()
            if normalized in localized_names[locale]:
                raise ValueError(f"{context} duplicates a {locale} name")
            localized_names[locale].add(normalized)
        if kind != "categories":
            color = resource.get("color")
            if not isinstance(color, str) or HEX_COLOR_PATTERN.fullmatch(color) is None:
                raise ValueError(f"{context} has an invalid color")
        sort_order = resource.get("sort_order")
        if not isinstance(sort_order, int) or sort_order < 0 or sort_order <= previous_order:
            raise ValueError(f"{context} has an invalid ordering")
        previous_order = sort_order
        if kind == "categories" and not is_allowed_category_icon(str(resource.get("icon_id", ""))):
            raise ValueError(f"{context} references an unknown category icon")
        if kind == "statuses" and resource.get("functional_state") not in {"non_visited", "visited"}:
            raise ValueError(f"{context} has an invalid functional state")


def load_profile_catalog(path: Path = CATALOG_PATH) -> tuple[dict[str, Any], ...]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Unable to read starter profile catalog: {error}") from error
    if not isinstance(payload, dict) or payload.get("version") != 1 or not isinstance(payload.get("profiles"), list):
        raise ValueError("Invalid starter profile catalog envelope")
    profiles = payload["profiles"]
    ids = tuple(profile.get("id") for profile in profiles if isinstance(profile, dict))
    if ids != EXPECTED_PROFILE_IDS:
        raise ValueError(f"Starter profile ids or ordering are invalid: {ids}")
    for profile in profiles:
        _localized(profile.get("name"), f"Profile {profile['id']} name")
        _localized(profile.get("description"), f"Profile {profile['id']} description")
        if not isinstance(profile.get("ui_icon"), str) or not profile["ui_icon"]:
            raise ValueError(f"Profile {profile['id']} has no UI icon")
        for kind in ("categories", "tags", "statuses"):
            _validate_resources(profile, kind)
        status_keys = {item["key"] for item in profile["statuses"]}
        default_key = profile.get("default_status_key")
        if profile["id"] == "custom":
            if default_key is not None or any(profile[kind] for kind in ("categories", "tags", "statuses")):
                raise ValueError("The custom profile must stay empty")
        elif default_key not in status_keys:
            raise ValueError(f"Profile {profile['id']} default status is missing")
    return tuple(profiles)


PROFILE_CATALOG = load_profile_catalog()
PROFILE_BY_ID = {profile["id"]: profile for profile in PROFILE_CATALOG}


def public_profiles(locale: str) -> list[StarterProfileRead]:
    language = "en" if locale == "en" else "fr"
    result: list[StarterProfileRead] = []
    for profile in PROFILE_CATALOG:
        result.append(StarterProfileRead(
            id=profile["id"], name=profile["name"][language],
            description=profile["description"][language], ui_icon=profile["ui_icon"],
            categories=[{**item, "name": item["name"][language]} for item in profile["categories"]],
            tags=[{**item, "name": item["name"][language]} for item in profile["tags"]],
            statuses=[
                {**item, "name": item["name"][language], "is_default": item["key"] == profile["default_status_key"]}
                for item in profile["statuses"]
            ],
        ))
    return result
