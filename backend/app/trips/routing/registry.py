from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import replace
from datetime import UTC, datetime
from hashlib import sha256
import logging
from threading import Lock
from time import monotonic

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import User, UserApiCredential
from app.config import google_routes_settings, google_routing_limit_settings, openroute_service_settings, task_settings
from app.trips.routing.base import RoutingError, RoutingProvider
from app.trips.routing.fallback import FallbackRoutingProvider
from app.trips.routing.google import GoogleRoutesProvider
from app.trips.routing.osrm import OsrmRoutingProvider
from app.trips.routing.openrouteservice import OpenRouteServiceProvider


logger = logging.getLogger(__name__)


class GoogleRoutingRateLimiter:
    """Per-user limiter backed by Redis in distributed deployments.

    Google remains the authoritative quota provider. This smaller application
    limit protects users from accidental loops and unexpected billable bursts.
    """

    _SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
"""

    def __init__(self, limit: int = 120, window_seconds: float = 60, redis_client: Redis | None = None):
        self.limit = limit
        self.window_seconds = window_seconds
        self._redis = redis_client
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        if self._redis is not None:
            try:
                opaque = sha256(key.encode("utf-8")).hexdigest()
                current, ttl = self._redis.eval(
                    self._SCRIPT,
                    1,
                    f"cartavault:routing:rate:{opaque}",
                    max(1, round(self.window_seconds)),
                )
                if int(current) > self.limit:
                    retry_after = max(1, int(ttl))
                    raise RoutingError(
                        "Trop de calculs Google Routes ont été demandés. Réessayez dans un instant.",
                        "GOOGLE_ROUTING_RATE_LIMITED",
                        retry_after=retry_after,
                    )
                return
            except RoutingError:
                raise
            except RedisError:
                logger.warning("Redis routing limiter unavailable; using process-local fallback", exc_info=True)
        self._check_local(key)

    def _check_local(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            requests = self._requests[key]
            while requests and requests[0] <= now - self.window_seconds:
                requests.popleft()
            if len(requests) >= self.limit:
                retry_after = max(1, round(self.window_seconds - (now - requests[0])))
                raise RoutingError(
                    "Trop de calculs Google Routes ont été demandés. Réessayez dans un instant.",
                    "GOOGLE_ROUTING_RATE_LIMITED",
                    retry_after=retry_after,
                )
            requests.append(now)


def _routing_redis() -> Redis | None:
    if task_settings.mode != "redis":
        return None
    return Redis.from_url(task_settings.redis_url, decode_responses=True)


google_routing_rate_limiter = GoogleRoutingRateLimiter(
    limit=google_routing_limit_settings.requests_per_minute,
    window_seconds=google_routing_limit_settings.window_seconds,
    redis_client=_routing_redis(),
)

ors_routing_rate_limiter = GoogleRoutingRateLimiter(
    limit=openroute_service_settings.requests_per_minute,
    window_seconds=60,
    redis_client=_routing_redis(),
)


def google_credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == "google_routes"))


def ors_credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == "openrouteservice"))


class RoutingProviderRegistry:
    def capabilities(self, session: Session, user: User) -> list[dict[str, object]]:
        credential = google_credential(session, user.id)
        storage_available = CredentialEncryptionService.configured()
        configured = credential is not None
        verified = configured and credential.verified_at is not None
        ors = ors_credential(session, user.id)
        ors_configured = ors is not None
        ors_verified = ors_configured and ors.verified_at is not None
        ors_self_hosted = openroute_service_settings.allow_unauthenticated
        return [
            {"id": "osrm", "label": "OSRM", "available": True, "supports_route": True, "supports_matrix": True, "supports_waypoint_optimization": False},
            {"id": "google", "label": "Google Routes", "available": storage_available and verified, "credential_configured": configured, "credential_verified": verified, "supports_route": True, "supports_matrix": False, "supports_waypoint_optimization": True},
            {"id": "openrouteservice", "label": "OpenRouteService", "available": openroute_service_settings.enabled and (ors_self_hosted or storage_available and ors_verified), "credential_configured": ors_configured, "credential_verified": ors_verified, "self_hosted": ors_self_hosted, "supports_route": True, "supports_matrix": True, "supports_waypoint_optimization": False, "supported_profiles": ["driving", "cycling", "walking"]},
        ]

    def resolve(self, session: Session, user: User, provider_id: str, options: dict[str, object] | None = None) -> RoutingProvider:
        if provider_id == "osrm":
            return OsrmRoutingProvider()
        if provider_id == "openrouteservice":
            return self._resolve_ors(session, user, options)
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

    def _resolve_ors(self, session: Session, user: User, options: dict[str, object] | None) -> RoutingProvider:
        if not openroute_service_settings.enabled:
            if openroute_service_settings.fallback_to_osrm:
                return OsrmRoutingProvider()
            raise RoutingError("OpenRouteService est désactivé.", "ROUTING_PROVIDER_UNAVAILABLE")
        credential = ors_credential(session, user.id)
        api_key: str | None = None
        if credential is not None and credential.verified_at is not None:
            try:
                api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
            except CredentialEncryptionError as error:
                credential.last_error_code = error.code
                session.commit()
        elif not openroute_service_settings.allow_unauthenticated:
            if openroute_service_settings.fallback_to_osrm:
                return OsrmRoutingProvider()
            raise RoutingError("La clé OpenRouteService doit être vérifiée.", "ROUTING_CREDENTIAL_NOT_VERIFIED")

        def success() -> None:
            if credential is not None:
                credential.last_used_at = datetime.now(UTC).replace(tzinfo=None)
                credential.last_error_code = None
                session.commit()

        def failure(code: str) -> None:
            if credential is not None:
                credential.last_error_code = code
                if code == "ORS_AUTH_ERROR":
                    credential.verified_at = None
                session.commit()

        def limit() -> None:
            try:
                ors_routing_rate_limiter.check(f"ors:{user.id}")
            except RoutingError as error:
                raise RoutingError("Trop de calculs OpenRouteService ont été demandés. Réessayez dans un instant.", "ORS_LOCAL_RATE_LIMITED", retry_after=error.retry_after) from error

        primary = OpenRouteServiceProvider(
            api_key,
            language=str((options or {}).get("language", "fr")),
            before_request=limit,
            on_success=success,
            on_error=failure,
        )
        return FallbackRoutingProvider(primary, OsrmRoutingProvider()) if openroute_service_settings.fallback_to_osrm else primary


routing_provider_registry = RoutingProviderRegistry()


def routing_preferences(preferences: object) -> dict[str, object]:
    root = preferences if isinstance(preferences, dict) else {}
    routing = root.get("routing") if isinstance(root.get("routing"), dict) else {}
    return {
        "provider": routing.get("provider", "osrm"),
        "language": root.get("language", "fr"),
    }
