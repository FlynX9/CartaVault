from __future__ import annotations

import os
from dataclasses import dataclass, field


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = int(raw)
    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer")
    return value


def _nonnegative_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = int(raw)
    if value < 0:
        raise RuntimeError(f"{name} must be a non-negative integer")
    return value


def _boolean(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean")


@dataclass(frozen=True)
class SecuritySettings:
    session_cookie_name: str = os.getenv("CARTAVAULT_SESSION_COOKIE_NAME", "cartavault_session")
    csrf_cookie_name: str = os.getenv("CARTAVAULT_CSRF_COOKIE_NAME", "cartavault_csrf")
    session_days: int = _positive_int("CARTAVAULT_SESSION_DAYS", 14)
    session_activity_write_interval_seconds: int = _positive_int(
        "CARTAVAULT_SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS",
        300,
    )
    invitation_hours: int = _positive_int("CARTAVAULT_INVITATION_HOURS", 168)
    cookie_secure: bool = _boolean("CARTAVAULT_COOKIE_SECURE", False)
    password_min_length: int = _positive_int("CARTAVAULT_PASSWORD_MIN_LENGTH", 12)
    registration_verification_hours: int = _positive_int("CARTAVAULT_REGISTRATION_VERIFICATION_HOURS", 24)
    registration_retention_days: int = _positive_int("CARTAVAULT_REGISTRATION_RETENTION_DAYS", 30)
    argon2_time_cost: int = _positive_int("CARTAVAULT_ARGON2_TIME_COST", 3)
    argon2_memory_cost: int = _positive_int("CARTAVAULT_ARGON2_MEMORY_COST", 65536)
    argon2_parallelism: int = _positive_int("CARTAVAULT_ARGON2_PARALLELISM", 4)


security_settings = SecuritySettings()


@dataclass(frozen=True)
class RoutingSettings:
    base_url: str = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
    timeout_seconds: int = _positive_int("OSRM_TIMEOUT_SECONDS", 12)
    max_waypoints: int = _positive_int("OSRM_MAX_WAYPOINTS", 50)
    profile: str = os.getenv("OSRM_PROFILE", "driving")
    # Natural Earth 1:110m boundaries are intentionally compact and can be
    # offset by several hundred metres around mountain or river frontiers.
    country_boundary_tolerance_meters: int = _nonnegative_int("ROUTING_COUNTRY_BOUNDARY_TOLERANCE_METERS", 1_000)
    max_outside_distance_meters: int = _nonnegative_int("ROUTING_MAX_OUTSIDE_DISTANCE_METERS", 500)


routing_settings = RoutingSettings()


@dataclass(frozen=True)
class ReverseGeocodingSettings:
    base_url: str = os.getenv(
        "CARTAVAULT_REVERSE_GEOCODING_URL",
        "https://nominatim.openstreetmap.org",
    ).strip().rstrip("/")
    user_agent: str = os.getenv(
        "CARTAVAULT_REVERSE_GEOCODING_USER_AGENT",
        "CartaVault/0.1 (self-hosted POI manager)",
    ).strip()
    timeout_seconds: int = _positive_int(
        "CARTAVAULT_REVERSE_GEOCODING_TIMEOUT_SECONDS",
        8,
    )
    minimum_interval_seconds: int = _positive_int(
        "CARTAVAULT_REVERSE_GEOCODING_MIN_INTERVAL_SECONDS",
        1,
    )
    def __post_init__(self) -> None:
        if not self.base_url.startswith(("http://", "https://")):
            raise RuntimeError("CARTAVAULT_REVERSE_GEOCODING_URL must be an HTTP(S) URL")
        if not self.user_agent:
            raise RuntimeError("CARTAVAULT_REVERSE_GEOCODING_USER_AGENT cannot be empty")


reverse_geocoding_settings = ReverseGeocodingSettings()


@dataclass(frozen=True)
class GoogleRoutesSettings:
    base_url: str = os.getenv("GOOGLE_MAPS_ROUTES_BASE_URL", "https://routes.googleapis.com")
    timeout_seconds: int = _positive_int("GOOGLE_MAPS_ROUTES_TIMEOUT_SECONDS", 15)
    connect_timeout_seconds: int = _positive_int("GOOGLE_MAPS_ROUTES_CONNECT_TIMEOUT_SECONDS", 5)
    routing_preference: str = os.getenv("GOOGLE_MAPS_ROUTING_PREFERENCE", "TRAFFIC_UNAWARE").upper()
    avoid_tolls: bool = _boolean("GOOGLE_MAPS_AVOID_TOLLS", False)
    avoid_highways: bool = _boolean("GOOGLE_MAPS_AVOID_HIGHWAYS", False)
    avoid_ferries: bool = _boolean("GOOGLE_MAPS_AVOID_FERRIES", False)

    def __post_init__(self) -> None:
        if self.routing_preference not in {"TRAFFIC_UNAWARE", "TRAFFIC_AWARE", "TRAFFIC_AWARE_OPTIMAL"}:
            raise RuntimeError("GOOGLE_MAPS_ROUTING_PREFERENCE is invalid")

google_routes_settings = GoogleRoutesSettings()
legacy_google_routes_api_key_configured = bool(os.getenv("GOOGLE_MAPS_ROUTES_API_KEY", "").strip())


@dataclass(frozen=True)
class OpenRouteServiceSettings:
    enabled: bool = _boolean("CARTAVAULT_ORS_ENABLED", True)
    base_url: str = os.getenv("CARTAVAULT_ORS_BASE_URL", "https://api.openrouteservice.org").strip().rstrip("/")
    timeout_seconds: int = _positive_int("CARTAVAULT_ORS_TIMEOUT_SECONDS", 15)
    max_waypoints: int = _positive_int("CARTAVAULT_ORS_MAX_WAYPOINTS", 50)
    allow_unauthenticated: bool = _boolean("CARTAVAULT_ORS_ALLOW_UNAUTHENTICATED", False)
    fallback_to_osrm: bool = _boolean("CARTAVAULT_ORS_FALLBACK_TO_OSRM", True)
    requests_per_minute: int = _positive_int("CARTAVAULT_ORS_REQUESTS_PER_MINUTE", 40)

    def __post_init__(self) -> None:
        if not self.base_url.startswith(("http://", "https://")):
            raise RuntimeError("CARTAVAULT_ORS_BASE_URL must be a fixed HTTP(S) URL")
        if self.allow_unauthenticated and self.base_url == "https://api.openrouteservice.org":
            raise RuntimeError("Unauthenticated ORS access is only allowed for a self-hosted base URL")


openroute_service_settings = OpenRouteServiceSettings()


@dataclass(frozen=True)
class GoogleMapTilesSettings:
    enabled: bool = _boolean("CARTAVAULT_GOOGLE_SATELLITE_ENABLED", True)
    base_url: str = os.getenv("CARTAVAULT_GOOGLE_MAP_TILES_BASE_URL", "https://tile.googleapis.com").strip().rstrip("/")
    timeout_seconds: int = _positive_int("CARTAVAULT_GOOGLE_MAP_TILES_TIMEOUT_SECONDS", 10)
    daily_soft_limit: int = _positive_int("CARTAVAULT_GOOGLE_MAP_TILES_DAILY_LIMIT", 10_000)
    monthly_soft_limit: int = _positive_int("CARTAVAULT_GOOGLE_MAP_TILES_MONTHLY_LIMIT", 100_000)

    def __post_init__(self) -> None:
        if self.base_url != "https://tile.googleapis.com":
            raise RuntimeError("CARTAVAULT_GOOGLE_MAP_TILES_BASE_URL must use the official Google endpoint")


google_map_tiles_settings = GoogleMapTilesSettings()


@dataclass(frozen=True)
class GoogleRoutingLimitSettings:
    requests_per_minute: int = _positive_int("CARTAVAULT_GOOGLE_ROUTES_REQUESTS_PER_MINUTE", 120)
    window_seconds: int = _positive_int("CARTAVAULT_GOOGLE_ROUTES_RATE_WINDOW_SECONDS", 60)
    proposal_ttl_seconds: int = _positive_int("CARTAVAULT_ROUTING_PROPOSAL_TTL_SECONDS", 900)


google_routing_limit_settings = GoogleRoutingLimitSettings()


@dataclass(frozen=True)
class CredentialSettings:
    encryption_key: str = os.getenv("CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY", "").strip()


credential_settings = CredentialSettings()


@dataclass(frozen=True)
class EmailSettings:
    provider: str = os.getenv("EMAIL_PROVIDER", "resend").strip().lower()
    from_name: str = os.getenv("EMAIL_FROM_NAME", "CartaVault").strip()
    from_address: str = os.getenv("EMAIL_FROM_ADDRESS", "no-reply@cartavault.fr").strip()
    reply_to: str = os.getenv("EMAIL_REPLY_TO", "contact@cartavault.fr").strip()
    frontend_public_url: str = os.getenv("FRONTEND_PUBLIC_URL", "http://localhost:5173").strip().rstrip("/")
    password_reset_token_ttl_minutes: int = _positive_int("PASSWORD_RESET_TOKEN_TTL_MINUTES", 30)
    timeout_seconds: int = _positive_int("EMAIL_PROVIDER_TIMEOUT_SECONDS", 10)
    max_attempts: int = _positive_int("EMAIL_PROVIDER_MAX_ATTEMPTS", 2)
    retry_delay_seconds: int = _nonnegative_int("EMAIL_PROVIDER_RETRY_DELAY_SECONDS", 1)
    smtp_host: str = os.getenv("EMAIL_SMTP_HOST", "").strip()
    smtp_port: int = _positive_int("EMAIL_SMTP_PORT", 587)
    smtp_security: str = os.getenv("EMAIL_SMTP_SECURITY", "starttls").strip().lower()
    smtp_username: str = os.getenv("EMAIL_SMTP_USERNAME", "").strip()
    smtp_password: str = field(default=os.getenv("EMAIL_SMTP_PASSWORD", ""), repr=False)

    def __post_init__(self) -> None:
        if self.provider not in {"resend", "smtp", "none"}:
            raise RuntimeError("EMAIL_PROVIDER must be 'resend', 'smtp' or 'none'")
        if self.smtp_port > 65535:
            raise RuntimeError("EMAIL_SMTP_PORT must be at most 65535")
        if self.smtp_security not in {"starttls", "tls", "none"}:
            raise RuntimeError("EMAIL_SMTP_SECURITY must be 'starttls', 'tls' or 'none'")
        if self.provider == "smtp" and not self.smtp_host:
            raise RuntimeError("EMAIL_SMTP_HOST is required when EMAIL_PROVIDER=smtp")
        if self.provider == "smtp" and not self.from_address:
            raise RuntimeError("EMAIL_FROM_ADDRESS is required when EMAIL_PROVIDER=smtp")
        if self.provider == "smtp" and bool(self.smtp_username) != bool(self.smtp_password):
            raise RuntimeError("EMAIL_SMTP_USERNAME and EMAIL_SMTP_PASSWORD must be configured together")


email_settings = EmailSettings()


@dataclass(frozen=True)
class TaskSettings:
    mode: str = os.getenv("CARTAVAULT_TASK_MODE", "sync").strip().lower()
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0").strip()
    queue_name: str = os.getenv("CARTAVAULT_TASK_QUEUE", "cartavault").strip()
    default_timeout_seconds: int = _positive_int("CARTAVAULT_TASK_TIMEOUT_SECONDS", 1800)
    result_ttl_seconds: int = _positive_int("CARTAVAULT_TASK_RESULT_TTL_SECONDS", 86400)
    stale_after_seconds: int = _positive_int("CARTAVAULT_TASK_STALE_AFTER_SECONDS", 3600)

    def __post_init__(self) -> None:
        if self.mode not in {"sync", "redis"}:
            raise RuntimeError("CARTAVAULT_TASK_MODE must be 'sync' or 'redis'")
        if self.mode == "redis" and not self.redis_url.startswith(("redis://", "rediss://")):
            raise RuntimeError("REDIS_URL must be a Redis URL")
        if not self.queue_name:
            raise RuntimeError("CARTAVAULT_TASK_QUEUE cannot be empty")


task_settings = TaskSettings()
