import re


HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-F]{6}$")


def normalize_hex_color(value: object, *, label: str = "color") -> object:
    """Normalize a user-provided hexadecimal color for configurable catalogs."""

    if not isinstance(value, str):
        return value
    color = value.strip().upper()
    if not HEX_COLOR_PATTERN.fullmatch(color):
        raise ValueError(f"The {label} must use the #RRGGBB format")
    return color
