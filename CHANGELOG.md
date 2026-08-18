# Changelog

All notable CartaVault changes are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- No documented changes yet.

### Changed

- No documented changes yet.

### Deprecated

- No documented changes yet.

### Removed

- No documented changes yet.

### Fixed

- No documented changes yet.

### Security

- No documented changes yet.

## [1.0.0] - 2026-08-18

First stable CartaVault release, consolidating `0.9.0-beta.1` and the five
1.0 release candidates. The complete user-facing release notes are maintained
in [`docs/release-notes-v1.0.0.md`](docs/release-notes-v1.0.0.md).

### Added

- Offline CartaVault Vector basemaps, an installable mobile PWA, persistent
  place annotations, optional S3 media storage, multi-factor authentication,
  OpenRouteService, quota profiles, shared instance API keys and diagnostics.

### Changed

- Classic and satellite basemaps are independently configurable, with Google,
  Stadia and Mapbox integrations, resilient fallback and provider metering.
- The administration, privacy, registration, media and bilingual documentation
  experiences were rebuilt for desktop and mobile use.

### Fixed

- Provider traffic, tile caching and database-session handling no longer allow
  concurrent tile bursts to starve normal application requests.
- Upgrades reliably refresh the PWA entry point and preserve the required
  registration-review administration workflow.

### Security

- Provider secrets remain encrypted and server-side; release images are
  non-root, read-only and published with SBOM, provenance and attestations.

## [1.0.0-rc.5] - 2026-08-18

Fifth CartaVault 1.0 release candidate.

### Changed

- Raster provider secrets are now issued through encrypted, automatically renewed tile sessions.
- Google Map Tiles database accounting is bounded below the SQLAlchemy pool capacity.

### Fixed

- Prevented concurrent Stadia, Mapbox, and Google tile bursts from exhausting the PostgreSQL connection pool and blocking the rest of the application.
- Ensured request database sessions are finalized without waiting for a free AnyIO worker thread.
- Restored pending registration review, rejection, and quota assignment in the redesigned administration user screen.

## [1.0.0-rc.4] - 2026-08-18

Fourth CartaVault 1.0 release candidate.

### Changed

- Deduplicated concurrent account-preference requests during application startup.
- Added a bounded shared asynchronous HTTP client for proxied basemap tiles.

### Fixed

- Prevented Stadia and Mapbox tile requests from retaining PostgreSQL connections while waiting for remote providers.
- Kept the health endpoint responsive while many basemap tiles are loading.
- Removed duplicate Retina scaling that caused Stadia to download four times too many high-resolution tiles.
- Added effective browser caching for proxied Stadia and Mapbox tiles.

## [1.0.0-rc.3] - 2026-08-17

Third CartaVault 1.0 release candidate.

### Changed

- Google classic mapping now uses the EEA-compatible Maps JavaScript integration with the independently assigned classic basemap key.

### Fixed

- Removed the application bootstrap inline script blocked by the production Content Security Policy.
- Allowed the Google Fonts stylesheet required by the Google Maps JavaScript renderer without relaxing other CSP directives.

## [1.0.0-rc.2] - 2026-08-17

Second CartaVault 1.0 release candidate.

### Fixed

- Prevented browsers and PWA installations from retaining a stale application entry point after a container upgrade.
- Ensured the classic basemap configuration remains visible alongside the independently configured satellite basemap.

## [1.0.0-rc.1] - 2026-08-17

First CartaVault 1.0 release candidate.

### Added

- Private maps associated with users.
- Places with PostGIS geographic coordinates.
- Interactive Leaflet map.
- Place creation from the map.
- Categories, tags, and statuses.
- Local catalog of 300 category icons.
- Place photos.
- KML/KMZ import.
- Trip planning and day organization.
- OSRM route calculations.
- Optional Google Routes support using per-user credentials.
- Users, roles, and permissions.
- Trash and audit history.
- Light and dark interface themes.
- Initial project documentation.
- GitHub issue and pull request templates.
- Contribution guide.
- Manual pre-release test checklist.
- Offline vector basemaps generated and managed by CartaVault.
- Separate classic and satellite map provider configuration.
- Google Maps JavaScript API satellite integration for EEA accounts.
- Google, Stadia, Mapbox and OpenRouteService API credential management.
- Instance API keys shared with users through quota profiles.
- Administrative instance diagnostics, quotas and API key management.

### Changed

- The project is presented under the CartaVault name.
- The interface has progressively been aligned with the CartaVault visual identity.
- Map selection now exposes only the modes available for the configured providers.
- Administrative and account secondary dialogs share a consistent responsive backdrop and layout.
- The standard NAS topology uses one hardened application container and one digest-pinned PostGIS container.

### Fixed

- Restored Stadia light and dark maps and reliable map-provider fallback behavior.
- Added reliable Google satellite support for both Map Tiles and Maps JavaScript integrations.
- Corrected quota, user, diagnostics and offline-data administration views.
- Corrected modal focus retention, desktop sizing, dark-theme colors and action layouts.
- Allowed failed offline basemap installations to be removed.

### Security

- Versioned encryption for Google Routes credentials.
- No Google Routes key is stored in the browser.
- Credentials are removed when an account is anonymized or deleted.
- Permissions are enforced for map- and user-owned data.
- `.env` files, private keys, and secrets are excluded from the repository.
- Shared instance credentials remain encrypted, masked and read-only for users.
- Release images run as a non-root user with a read-only filesystem and dropped capabilities.

[Unreleased]: https://github.com/FlynX9/CartaVault/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0
[1.0.0-rc.5]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0-rc.5
[1.0.0-rc.4]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0-rc.4
[1.0.0-rc.3]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0-rc.3
[1.0.0-rc.2]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0-rc.2
[1.0.0-rc.1]: https://github.com/FlynX9/CartaVault/releases/tag/v1.0.0-rc.1
