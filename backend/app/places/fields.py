"""Map-scoped optional place field configuration."""

CONFIGURABLE_PLACE_FIELDS = (
    "description", "region", "construction_date", "abandonment_date", "condition",
    "access", "danger_level", "links", "ratings", "favorite",
)


def normalize_place_field_config(value: dict[str, bool] | None) -> dict[str, bool]:
    configured = value or {}
    return {field: configured.get(field, True) is not False for field in CONFIGURABLE_PLACE_FIELDS}
