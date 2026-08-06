# OpenRouteService routing

CartaVault can use OpenRouteService (ORS) for driving, cycling and walking routes. The public ORS service requires each user to save and verify their own key in **Account → Preferences → Routing**. Keys are encrypted at rest with `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`, are only decrypted immediately before a server-side request, and are never returned by the API.

Configuration:

- `CARTAVAULT_ORS_ENABLED`: expose the provider (default `true`).
- `CARTAVAULT_ORS_BASE_URL`: trusted hosted or self-hosted endpoint.
- `CARTAVAULT_ORS_TIMEOUT_SECONDS`, `CARTAVAULT_ORS_MAX_WAYPOINTS`, `CARTAVAULT_ORS_REQUESTS_PER_MINUTE`: operational limits.
- `CARTAVAULT_ORS_FALLBACK_TO_OSRM`: preserve route calculation during authentication, quota or availability failures (default `true`).
- `CARTAVAULT_ORS_ALLOW_UNAUTHENTICATED`: only for a trusted self-hosted endpoint. Startup rejects this option with the public ORS URL.

CartaVault sends only coordinates, the selected travel profile and the interface language. It stores normalized GeoJSON, distances, durations and localized instructions. API keys, raw authorization headers and provider URLs are never written to route data or logs. Removing a personal key resets the preference to OSRM unless an explicitly configured no-key self-hosted ORS service is available.
