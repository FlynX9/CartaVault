from __future__ import annotations

from typing import Final, Literal


ApiKeyCapability = Literal["routing", "places_search", "classic_basemap", "satellite_basemap"]

CAPABILITIES_BY_PROVIDER: Final[dict[str, frozenset[ApiKeyCapability]]] = {
    "google": frozenset({"routing", "places_search", "classic_basemap", "satellite_basemap"}),
    "stadia": frozenset({"places_search", "classic_basemap", "satellite_basemap"}),
    "mapbox": frozenset({"satellite_basemap"}),
    "openrouteservice": frozenset({"routing"}),
    "resend": frozenset(),
}


def default_capabilities(provider: str) -> list[ApiKeyCapability]:
    return sorted(CAPABILITIES_BY_PROVIDER.get(provider, ()))


def normalized_capabilities(provider: str, capabilities: list[str]) -> list[ApiKeyCapability]:
    allowed = CAPABILITIES_BY_PROVIDER.get(provider, frozenset())
    return sorted({capability for capability in capabilities if capability in allowed})  # type: ignore[return-value]


def supports_capability(provider: str, capabilities: list[str] | None, capability: ApiKeyCapability) -> bool:
    effective = capabilities if capabilities is not None else default_capabilities(provider)
    return capability in effective and capability in CAPABILITIES_BY_PROVIDER.get(provider, ())
