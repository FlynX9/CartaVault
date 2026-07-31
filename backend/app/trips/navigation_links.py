from __future__ import annotations

from enum import StrEnum
from math import isfinite
from urllib.parse import urlencode


class NavigationProvider(StrEnum):
    GOOGLE_MAPS = "google_maps"
    WAZE = "waze"


class InvalidNavigationCoordinates(ValueError):
    pass


def build_navigation_url(provider: NavigationProvider, latitude: float, longitude: float) -> str:
    if not isfinite(latitude) or not -90 <= latitude <= 90:
        raise InvalidNavigationCoordinates("Latitude must be between -90 and 90")
    if not isfinite(longitude) or not -180 <= longitude <= 180:
        raise InvalidNavigationCoordinates("Longitude must be between -180 and 180")
    coordinates = f"{_coordinate(latitude)},{_coordinate(longitude)}"
    if provider is NavigationProvider.GOOGLE_MAPS:
        return "https://www.google.com/maps/search/?" + urlencode({"api": "1", "query": coordinates}, safe=",")
    if provider is NavigationProvider.WAZE:
        return "https://waze.com/ul?" + urlencode({"ll": coordinates, "navigate": "yes"}, safe=",")
    raise ValueError("Unsupported navigation provider")


def _coordinate(value: float) -> str:
    rendered = f"{value:.7f}".rstrip("0").rstrip(".")
    return "0" if rendered in {"-0", ""} else rendered
