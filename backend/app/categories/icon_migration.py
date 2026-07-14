"""Deterministic compatibility mappings for the category icon migration."""

from app.categories.icon_catalog import CATEGORY_ICON_IDS, DEFAULT_CATEGORY_ICON_ID


LEGACY_CATEGORY_ICON_TO_ICONIFY = {
    "map-pin": "material-symbols:location-on-outline",
    "landmark": "mdi:bank-outline",
    "building-2": "mdi:office-building-outline",
    "church": "mdi:church",
    "castle": "mdi:castle",
    "factory": "mdi:factory",
    "warehouse": "mdi:warehouse",
    "school": "mdi:school-outline",
    "hospital": "mdi:hospital-building",
    "hotel": "mdi:hotel",
    "house": "mdi:home-outline",
    "theater": "mdi:theater",
    "train": "mdi:train",
    "bridge": "mdi:bridge",
    "mountain": "mdi:image-filter-hdr",
    "tree-pine": "mdi:pine-tree",
    "circle-help": "material-symbols:help-outline",
}
ICONIFY_TO_LEGACY_CATEGORY_ICON = {
    iconify_icon: legacy_icon
    for legacy_icon, iconify_icon in LEGACY_CATEGORY_ICON_TO_ICONIFY.items()
}
LEGACY_CATEGORY_ICON_DEFAULT = "map-pin"


def upgrade_category_icon(icon_id: str) -> str:
    """Return a valid Iconify ID for a stored historical category icon."""

    if icon_id in CATEGORY_ICON_IDS:
        return icon_id

    return LEGACY_CATEGORY_ICON_TO_ICONIFY.get(icon_id, DEFAULT_CATEGORY_ICON_ID)


def downgrade_category_icon(icon_id: str) -> str:
    """Return the deterministic legacy equivalent, losing newer Iconify IDs."""

    return ICONIFY_TO_LEGACY_CATEGORY_ICON.get(
        icon_id,
        LEGACY_CATEGORY_ICON_DEFAULT,
    )
