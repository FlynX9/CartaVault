from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import ReverseGeocodingSettings, reverse_geocoding_settings
from app.places.models import Place


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReverseGeocodingResult:
    country: str | None
    country_code: str | None
    region_name: str | None
    region_type: str | None
    region_code: str | None
    admin_level: int | None
    source: str
    resolved_at: datetime


class ReverseGeocodingError(RuntimeError):
    def __init__(self, message: str, code: str = "REVERSE_GEOCODING_UNAVAILABLE"):
        super().__init__(message)
        self.code = code


class ReverseGeocoder(Protocol):
    def reverse(self, latitude: float, longitude: float) -> ReverseGeocodingResult: ...


def apply_region_resolution(
    place: Place,
    result: ReverseGeocodingResult,
) -> None:
    place.country = result.country
    place.country_code = result.country_code
    place.region = result.region_name
    place.region_type = result.region_type
    place.region_code = result.region_code
    place.region_admin_level = result.admin_level
    place.region_source = result.source
    place.region_resolved_at = result.resolved_at
    place.region_manually_overridden = False


# Nominatim's address vocabulary is international but not uniform. Prefer the
# first-order division, then progressively more local administrative levels.
REGION_CANDIDATES: tuple[tuple[str, int], ...] = (
    ("state", 4),
    ("region", 4),
    ("province", 4),
    ("state_district", 5),
    ("county", 6),
    ("municipality", 7),
)


def _normalized_text(value: object, maximum_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized[:maximum_length] if normalized else None


def normalize_nominatim_response(payload: dict[str, Any]) -> ReverseGeocodingResult:
    address = payload.get("address")
    if not isinstance(address, dict):
        address = {}

    region_name: str | None = None
    region_type: str | None = None
    admin_level: int | None = None
    for candidate, level in REGION_CANDIDATES:
        value = _normalized_text(address.get(candidate), 100)
        if value is not None:
            region_name = value
            region_type = candidate
            admin_level = level
            break

    # Some first-order administrative divisions are city-regions. Nominatim
    # exposes their name only as `city`, while the ISO level-4 code confirms
    # that the city itself is the relevant regional division (for example
    # Tbilisi / GE-TB). Do not use an ordinary city without that evidence.
    if region_name is None and _normalized_text(address.get("ISO3166-2-lvl4"), 40) is not None:
        city = _normalized_text(address.get("city"), 100)
        if city is not None:
            region_name = city
            region_type = "city"
            admin_level = 4

    region_code: str | None = None
    if admin_level is not None:
        code = _normalized_text(address.get(f"ISO3166-2-lvl{admin_level}"), 40)
        if code is not None:
            region_code = code.upper()

    country = _normalized_text(address.get("country"), 120)
    country_code = _normalized_text(address.get("country_code"), 2)
    if country_code is None or len(country_code) != 2 or not country_code.isalpha():
        country_code = None
    return ReverseGeocodingResult(
        country=country,
        country_code=country_code.upper() if country_code is not None else None,
        region_name=region_name,
        region_type=region_type,
        region_code=region_code,
        admin_level=admin_level,
        source="nominatim",
        resolved_at=datetime.now(UTC).replace(tzinfo=None),
    )


class NominatimReverseGeocoder:
    _rate_lock = threading.Lock()
    _last_request_at = 0.0

    def __init__(self, settings: ReverseGeocodingSettings | None = None):
        self.settings = settings or reverse_geocoding_settings

    def _wait_for_rate_limit(self) -> None:
        with self._rate_lock:
            elapsed = time.monotonic() - self.__class__._last_request_at
            delay = self.settings.minimum_interval_seconds - elapsed
            if delay > 0:
                time.sleep(delay)
            self.__class__._last_request_at = time.monotonic()

    def reverse(self, latitude: float, longitude: float) -> ReverseGeocodingResult:
        query = urlencode(
            {
                "lat": f"{latitude:.7f}",
                "lon": f"{longitude:.7f}",
                "format": "jsonv2",
                "addressdetails": "1",
                "accept-language": "fr",
            }
        )
        request = Request(
            f"{self.settings.base_url}/reverse?{query}",
            headers={
                "Accept": "application/json",
                "User-Agent": self.settings.user_agent,
            },
        )
        self._wait_for_rate_limit()
        try:
            with urlopen(request, timeout=self.settings.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise ReverseGeocodingError(
                f"Le service de géocodage a répondu avec le statut {error.code}.",
                "REVERSE_GEOCODING_HTTP_ERROR",
            ) from error
        except (TimeoutError, URLError) as error:
            raise ReverseGeocodingError(
                "Le service de géocodage ne répond pas actuellement.",
                "REVERSE_GEOCODING_TIMEOUT",
            ) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ReverseGeocodingError(
                "La réponse du service de géocodage est invalide.",
                "REVERSE_GEOCODING_INVALID_RESPONSE",
            ) from error
        if not isinstance(payload, dict):
            raise ReverseGeocodingError(
                "La réponse du service de géocodage est invalide.",
                "REVERSE_GEOCODING_INVALID_RESPONSE",
            )
        return normalize_nominatim_response(payload)


@lru_cache(maxsize=1)
def get_reverse_geocoder() -> ReverseGeocoder:
    return NominatimReverseGeocoder()


def log_resolution_failure(place_id: object, error: ReverseGeocodingError) -> None:
    logger.warning(
        "Reverse geocoding failed for place %s: %s",
        place_id,
        error.code,
    )
