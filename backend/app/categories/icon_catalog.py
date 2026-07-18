"""Load and validate the shared, curated category icon catalog."""

from dataclasses import dataclass
import json
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping


DEFAULT_CATEGORY_ICON_ID = "material-symbols:location-on-outline"
FALLBACK_CATEGORY_ICON_ID = "material-symbols:help-outline"
CATEGORY_ICON_GROUPS = frozenset({
    "buildings",
    "religion",
    "industry",
    "military",
    "health",
    "education",
    "culture",
    "transport",
    "tourism",
    "infrastructure",
    "nature",
    "access",
    "urban",
    "commerce",
    "accommodation",
    "administration",
    "heritage",
    "other",
})
ALLOWED_ICON_PREFIXES = ("mdi:", "material-symbols:")
EXPECTED_CATEGORY_ICON_COUNT = 300
CATALOG_ENTRY_FIELDS = frozenset({"id", "label", "group", "keywords"})
CATALOG_PATH = Path(__file__).resolve().parents[3] / "shared" / "category-icons.json"


@dataclass(frozen=True)
class CategoryIconCatalogEntry:
    """An immutable icon entry from the shared catalog."""

    id: str
    label: str
    group: str
    keywords: tuple[str, ...]


def _catalog_error(entry_index: int | None, message: str) -> ValueError:
    location = "catalog" if entry_index is None else f"catalog entry {entry_index}"
    return ValueError(f"Invalid category icon {location}: {message}")


def _contains_forbidden_content(value: str) -> bool:
    normalized = value.casefold()
    return (
        "http://" in normalized
        or "https://" in normalized
        or "<svg" in normalized
        or "</svg" in normalized
        or "<" in value
        or ">" in value
    )


def _validate_string(
    value: Any,
    field_name: str,
    entry_index: int,
) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _catalog_error(entry_index, f"{field_name} must be a non-empty string")

    if _contains_forbidden_content(value):
        raise _catalog_error(entry_index, f"{field_name} contains forbidden URL, HTML, or SVG content")

    return value


def load_category_icon_catalog(path: Path = CATALOG_PATH) -> tuple[CategoryIconCatalogEntry, ...]:
    """Read and strictly validate a shared category icon catalog JSON file."""

    try:
        raw_catalog = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid category icon catalog JSON at {path}: {error.msg}") from error
    except OSError as error:
        raise ValueError(f"Unable to read category icon catalog at {path}: {error}") from error

    if not isinstance(raw_catalog, list):
        raise _catalog_error(None, "must be a JSON array")

    if len(raw_catalog) != EXPECTED_CATEGORY_ICON_COUNT:
        raise _catalog_error(
            None,
            f"must contain exactly {EXPECTED_CATEGORY_ICON_COUNT} entries, found {len(raw_catalog)}",
        )

    entries: list[CategoryIconCatalogEntry] = []
    icon_ids: set[str] = set()

    for entry_index, raw_entry in enumerate(raw_catalog):
        if not isinstance(raw_entry, dict):
            raise _catalog_error(entry_index, "must be an object")

        unexpected_fields = set(raw_entry) - CATALOG_ENTRY_FIELDS
        missing_fields = CATALOG_ENTRY_FIELDS - set(raw_entry)
        if unexpected_fields:
            raise _catalog_error(entry_index, f"contains unexpected fields: {sorted(unexpected_fields)}")
        if missing_fields:
            raise _catalog_error(entry_index, f"is missing fields: {sorted(missing_fields)}")

        icon_id = _validate_string(raw_entry["id"], "id", entry_index)
        if not icon_id.startswith(ALLOWED_ICON_PREFIXES):
            raise _catalog_error(entry_index, "id uses an unsupported prefix")
        _, separator, icon_name = icon_id.partition(":")
        if separator != ":" or not icon_name or ":" in icon_name:
            raise _catalog_error(entry_index, "id must contain one non-empty qualified icon name")
        if icon_id in icon_ids:
            raise _catalog_error(entry_index, f"duplicates id {icon_id!r}")

        label = _validate_string(raw_entry["label"], "label", entry_index)
        group = _validate_string(raw_entry["group"], "group", entry_index)
        if group not in CATEGORY_ICON_GROUPS:
            raise _catalog_error(entry_index, f"group {group!r} is not allowed")

        raw_keywords = raw_entry["keywords"]
        if not isinstance(raw_keywords, list) or not raw_keywords:
            raise _catalog_error(entry_index, "keywords must be a non-empty array")
        keywords = tuple(
            _validate_string(keyword, "keywords item", entry_index)
            for keyword in raw_keywords
        )

        icon_ids.add(icon_id)
        entries.append(
            CategoryIconCatalogEntry(
                id=icon_id,
                label=label,
                group=group,
                keywords=keywords,
            )
        )

    if DEFAULT_CATEGORY_ICON_ID not in icon_ids:
        raise _catalog_error(None, f"does not include default id {DEFAULT_CATEGORY_ICON_ID!r}")
    if FALLBACK_CATEGORY_ICON_ID not in icon_ids:
        raise _catalog_error(None, f"does not include fallback id {FALLBACK_CATEGORY_ICON_ID!r}")

    return tuple(entries)


CATEGORY_ICON_CATALOG = load_category_icon_catalog()
CATEGORY_ICON_IDS = frozenset(entry.id for entry in CATEGORY_ICON_CATALOG)
_CATEGORY_ICON_BY_ID: Mapping[str, CategoryIconCatalogEntry] = MappingProxyType(
    {entry.id: entry for entry in CATEGORY_ICON_CATALOG}
)


def get_category_icon_entry(icon_id: str) -> CategoryIconCatalogEntry | None:
    """Return an icon catalog entry when its qualified identifier is known."""

    return _CATEGORY_ICON_BY_ID.get(icon_id)


def is_allowed_category_icon(icon_id: str) -> bool:
    """Return whether an icon identifier is one of the shared catalog entries."""

    return icon_id in CATEGORY_ICON_IDS
