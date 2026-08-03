from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class GooglePlacesError(RuntimeError):
    def __init__(self, message: str, code: str = "GOOGLE_PLACES_UNAVAILABLE"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class GooglePlaceResult:
    id: str
    name: str
    formatted_address: str
    latitude: float
    longitude: float
    country_code: str | None = None
    locality: str | None = None
    postal_code: str | None = None


def _component(components: object, component_type: str, field: str = "longText") -> str | None:
    if not isinstance(components, list):
        return None
    for component in components:
        if not isinstance(component, dict) or component_type not in component.get("types", []):
            continue
        value = component.get(field)
        return value if isinstance(value, str) else None
    return None


def _parse_place(value: object) -> GooglePlaceResult | None:
    if not isinstance(value, dict):
        return None
    location = value.get("location")
    display_name = value.get("displayName")
    if not isinstance(location, dict) or not isinstance(display_name, dict):
        return None
    latitude, longitude = location.get("latitude"), location.get("longitude")
    name, address, place_id = display_name.get("text"), value.get("formattedAddress"), value.get("id")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)) or not all(isinstance(item, str) and item for item in (name, address, place_id)):
        return None
    components = value.get("addressComponents")
    return GooglePlaceResult(
        id=f"google:{place_id}", name=name, formatted_address=address,
        latitude=float(latitude), longitude=float(longitude),
        country_code=_component(components, "country", "shortText"),
        locality=_component(components, "locality"), postal_code=_component(components, "postal_code"),
    )


def search_google_places(api_key: str, query: str, country_code: str | None = None, limit: int = 8) -> list[GooglePlaceResult]:
    payload: dict[str, object] = {"textQuery": query, "languageCode": "fr", "maxResultCount": max(1, min(limit, 20))}
    if country_code:
        payload["regionCode"] = country_code.upper()
    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={
            "Content-Type": "application/json", "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents",
            "User-Agent": "CartaVault/1",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read(2 * 1024 * 1024))
    except HTTPError as error:
        body = error.read(64 * 1024).decode("utf-8", errors="replace") if error.fp else ""
        normalized = body.lower()
        if error.code in {401, 403} and ("not enabled" in normalized or "has not been used" in normalized):
            raise GooglePlacesError("Google Places API n’est pas activée pour votre clé Google.", "GOOGLE_PLACES_API_DISABLED") from error
        if error.code == 429:
            raise GooglePlacesError("Le quota Google Places est temporairement dépassé.", "GOOGLE_PLACES_QUOTA_EXCEEDED") from error
        raise GooglePlacesError("Google Places a refusé la recherche.", "GOOGLE_PLACES_ACCESS_ERROR") from error
    except (TimeoutError, OSError, URLError, json.JSONDecodeError) as error:
        raise GooglePlacesError("Google Places est temporairement indisponible.") from error
    places = result.get("places", []) if isinstance(result, dict) else []
    return [parsed for item in places if (parsed := _parse_place(item)) is not None]
