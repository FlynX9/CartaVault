import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from app.categories.icon_catalog import (
    CATEGORY_ICON_CATALOG,
    CATEGORY_ICON_GROUPS,
    CATEGORY_ICON_IDS,
    CATALOG_PATH,
    DEFAULT_CATEGORY_ICON_ID,
    FALLBACK_CATEGORY_ICON_ID,
    get_category_icon_entry,
    is_allowed_category_icon,
    load_category_icon_catalog,
)
from app.categories.schemas import CategoryCreate, CategoryUpdate
from app.categories.icon_migration import (
    ICONIFY_TO_LEGACY_CATEGORY_ICON,
    LEGACY_CATEGORY_ICON_DEFAULT,
    LEGACY_CATEGORY_ICON_TO_ICONIFY,
    downgrade_category_icon,
    upgrade_category_icon,
)


pytestmark = pytest.mark.unit


def _catalog_payload() -> list[dict[str, object]]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _write_catalog(tmp_path: Path, payload: object) -> Path:
    catalog_path = tmp_path / "category-icons.json"
    catalog_path.write_text(json.dumps(payload), encoding="utf-8")
    return catalog_path


def test_shared_category_icon_catalog_is_valid_and_immutable() -> None:
    assert len(CATEGORY_ICON_CATALOG) == len(CATEGORY_ICON_IDS) == 80
    assert DEFAULT_CATEGORY_ICON_ID in CATEGORY_ICON_IDS
    assert FALLBACK_CATEGORY_ICON_ID in CATEGORY_ICON_IDS
    assert all(entry.group in CATEGORY_ICON_GROUPS for entry in CATEGORY_ICON_CATALOG)
    assert all(entry.label.strip() and entry.keywords for entry in CATEGORY_ICON_CATALOG)
    assert all(all(keyword.strip() for keyword in entry.keywords) for entry in CATEGORY_ICON_CATALOG)

    with pytest.raises(AttributeError):
        CATEGORY_ICON_CATALOG.append(CATEGORY_ICON_CATALOG[0])  # type: ignore[attr-defined]
    with pytest.raises(FrozenInstanceError):
        CATEGORY_ICON_CATALOG[0].label = "Modified"  # type: ignore[misc]


def test_shared_category_icon_catalog_resolves_known_and_unknown_ids() -> None:
    entry = get_category_icon_entry("mdi:church")

    assert entry is not None
    assert entry.id == "mdi:church"
    assert is_allowed_category_icon("mdi:church")
    assert get_category_icon_entry("mdi:not-installed") is None
    assert not is_allowed_category_icon("mdi:not-installed")


@pytest.mark.parametrize(
    ("description", "mutate"),
    [
        ("duplicate id", lambda payload: payload.__setitem__(2, {**payload[2], "id": payload[0]["id"]})),
        ("empty label", lambda payload: payload[2].__setitem__("label", " ")),
        ("unknown group", lambda payload: payload[2].__setitem__("group", "unknown")),
        ("invalid keywords", lambda payload: payload[2].__setitem__("keywords", [""])),
        ("unexpected field", lambda payload: payload[2].__setitem__("unexpected", True)),
        ("missing default", lambda payload: payload[0].__setitem__("id", "mdi:replacement")),
        ("missing fallback", lambda payload: payload[1].__setitem__("id", "mdi:replacement")),
        ("forbidden prefix", lambda payload: payload[2].__setitem__("id", "lucide:church")),
        ("forbidden SVG", lambda payload: payload[2].__setitem__("label", "<svg />")),
        ("forbidden URL", lambda payload: payload[2].__setitem__("label", "https://example.test/icon")),
    ],
)
def test_shared_category_icon_catalog_rejects_invalid_entries(
    tmp_path: Path,
    description: str,
    mutate,
) -> None:
    payload = _catalog_payload()
    mutate(payload)

    with pytest.raises(ValueError, match="Invalid category icon"):
        load_category_icon_catalog(_write_catalog(tmp_path, payload))


def test_shared_category_icon_catalog_rejects_invalid_json(tmp_path: Path) -> None:
    catalog_path = tmp_path / "category-icons.json"
    catalog_path.write_text("{", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid category icon catalog JSON"):
        load_category_icon_catalog(catalog_path)


def test_category_icon_schema_uses_qualified_catalog_ids() -> None:
    assert CategoryCreate(name="Category").icon == DEFAULT_CATEGORY_ICON_ID
    assert CategoryCreate(name="Category", icon=" mdi:church ").icon == "mdi:church"
    assert CategoryCreate(name="Category", icon="material-symbols:help-outline").icon == FALLBACK_CATEGORY_ICON_ID

    for icon_id in ("church", "map-pin", "mdi:not-installed", ""):
        with pytest.raises(ValueError, match="category icon is not allowed"):
            CategoryCreate(name="Category", icon=icon_id)

    with pytest.raises(ValueError, match="category icon cannot be null"):
        CategoryUpdate(icon=None)
    assert CategoryUpdate().model_dump(exclude_unset=True) == {}
    assert CategoryUpdate(icon="mdi:factory").icon == "mdi:factory"


def test_legacy_category_icon_mappings_are_complete_and_catalog_backed() -> None:
    assert len(LEGACY_CATEGORY_ICON_TO_ICONIFY) == 17
    assert set(LEGACY_CATEGORY_ICON_TO_ICONIFY.values()) <= CATEGORY_ICON_IDS
    assert {
        iconify_icon: legacy_icon
        for legacy_icon, iconify_icon in LEGACY_CATEGORY_ICON_TO_ICONIFY.items()
    } == ICONIFY_TO_LEGACY_CATEGORY_ICON

    for legacy_icon, iconify_icon in LEGACY_CATEGORY_ICON_TO_ICONIFY.items():
        assert upgrade_category_icon(legacy_icon) == iconify_icon
        assert downgrade_category_icon(iconify_icon) == legacy_icon

    assert upgrade_category_icon("mdi:wall") == "mdi:wall"
    assert upgrade_category_icon("unknown-icon") == DEFAULT_CATEGORY_ICON_ID
    assert downgrade_category_icon("mdi:wall") == LEGACY_CATEGORY_ICON_DEFAULT
    assert max(len(entry.id) for entry in CATEGORY_ICON_CATALOG) <= 50
