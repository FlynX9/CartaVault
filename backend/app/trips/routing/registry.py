from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import replace
from datetime import UTC, datetime
from threading import Lock
from time import monotonic

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import User, UserApiCredential
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


def google_credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == "google_routes"))


class RoutingProviderRegistry:
    def capabilities(self, session: Session, user: User) -> list[dict[str, object]]:
        credential = google_credential(session, user.id)
        storage_available = CredentialEncryptionService.configured()
        configured = credential is not None
        verified = configured and credential.verified_at is not None
        return [
            {"id": "osrm", "label": "OSRM", "available": True, "supports_route": True, "supports_matrix": True, "supports_waypoint_optimization": False},
            {"id": "google", "label": "Google Routes", "available": storage_available and verified, "credential_configured": configured, "credential_verified": verified, "supports_route": True, "supports_matrix": False, "supports_waypoint_optimization": True},
        ]

    def resolve(self, session: Session, user: User, provider_id: str, options: dict[str, object] | None = None) -> RoutingProvider:
        if provider_id == "osrm":
            return OsrmRoutingProvider()
        if provider_id != "google":
            raise RoutingError("Moteur de routage inconnu.", "ROUTING_PROVIDER_UNKNOWN")
        credential = google_credential(session, user.id)
        if credential is None:
            raise RoutingError("Aucune clé Google Routes personnelle n’est configurée.", "ROUTING_PROVIDER_UNAVAILABLE")
        if credential.verified_at is None:
            raise RoutingError("La clé Google Routes personnelle doit être vérifiée avant utilisation.", "ROUTING_CREDENTIAL_NOT_VERIFIED")
        try:
            api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
        except CredentialEncryptionError as error:
            raise RoutingError(str(error), error.code) from error
        values = options or {}
        settings = replace(
            google_routes_settings,
            routing_preference=str(values.get("traffic_mode", "traffic_unaware")).upper(),
            avoid_tolls=values.get("avoid_tolls") is True,
            avoid_highways=values.get("avoid_highways") is True,
            avoid_ferries=values.get("avoid_ferries") is True,
        )

        def success() -> None:
            credential.last_used_at = datetime.now(UTC).replace(tzinfo=None)
            credential.last_error_code = None
            session.commit()

        def failure(code: str) -> None:
            credential.last_error_code = code
            if code in {"GOOGLE_ROUTES_AUTH_ERROR", "GOOGLE_ROUTES_API_DISABLED", "GOOGLE_ROUTES_BILLING_REQUIRED", "GOOGLE_ROUTES_KEY_RESTRICTED"}:
                credential.verified_at = None
            session.commit()

        callback = lambda: google_routing_rate_limiter.check(str(user.id))
        return GoogleRoutesProvider(api_key, settings, before_request=callback, on_success=success, on_error=failure)


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
