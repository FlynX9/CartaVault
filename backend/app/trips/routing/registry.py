from __future__ import annotations

from dataclasses import replace
from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from app.config import google_routes_settings
from app.trips.routing.base import RoutingError, RoutingProvider
from app.trips.routing.google import GoogleRoutesProvider
from app.trips.routing.osrm import OsrmRoutingProvider

class GoogleRoutingRateLimiter:
    def __init__(self, limit: int = 20, window_seconds: float = 60):
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            requests = self._requests[key]
            while requests and requests[0] <= now - self.window_seconds:
                requests.popleft()
            if len(requests) >= self.limit:
                raise RoutingError("Trop de calculs Google Routes ont été demandés. Réessayez dans une minute.", "GOOGLE_ROUTING_RATE_LIMITED")
            requests.append(now)


google_routing_rate_limiter = GoogleRoutingRateLimiter()


class RoutingProviderRegistry:
    def capabilities(self) -> list[dict[str, object]]:
        return [
            {"id": "osrm", "label": "OSRM", "available": True, "supports_route": True, "supports_matrix": True, "supports_waypoint_optimization": False},
            {"id": "google", "label": "Google Routes", "available": google_routes_settings.available, "supports_route": True, "supports_matrix": False, "supports_waypoint_optimization": True},
        ]

    def resolve(self, provider_id: str, options: dict[str, object] | None = None, rate_limit_key: str | None = None) -> RoutingProvider:
        if provider_id == "osrm":
            return OsrmRoutingProvider()
        if provider_id != "google":
            raise RoutingError("Moteur de routage inconnu.", "ROUTING_PROVIDER_UNKNOWN")
        if not google_routes_settings.available:
            raise RoutingError("Le moteur Google Routes n’est pas configuré sur ce serveur.", "ROUTING_PROVIDER_UNAVAILABLE")
        values = options or {}
        traffic_mode = str(values.get("traffic_mode", "traffic_unaware")).upper()
        settings = replace(
            google_routes_settings,
            routing_preference=traffic_mode,
            avoid_tolls=values.get("avoid_tolls") is True,
            avoid_highways=values.get("avoid_highways") is True,
            avoid_ferries=values.get("avoid_ferries") is True,
        )
        callback = (lambda: google_routing_rate_limiter.check(rate_limit_key)) if rate_limit_key else None
        return GoogleRoutesProvider(settings, before_request=callback)


routing_provider_registry = RoutingProviderRegistry()


def routing_preferences(preferences: object) -> dict[str, object]:
    root = preferences if isinstance(preferences, dict) else {}
    routing = root.get("routing") if isinstance(root.get("routing"), dict) else {}
    return {
        "provider": routing.get("provider", "osrm"),
        "stay_in_country": routing.get("stay_in_country", root.get("keep_routes_in_country", False)) is True,
        "avoid_tolls": routing.get("avoid_tolls", False) is True,
        "avoid_highways": routing.get("avoid_highways", False) is True,
        "avoid_ferries": routing.get("avoid_ferries", False) is True,
        "traffic_mode": routing.get("traffic_mode", "traffic_unaware"),
    }
