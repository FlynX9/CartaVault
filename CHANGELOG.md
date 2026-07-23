# Changelog

All notable CartaVault changes are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/) from the `0.x` releases onward.

## Versioning convention

Until CartaVault reaches `1.0.0`:

- `0.MINOR.0` may introduce a significant feature, architecture evolution, or breaking change;
- `0.MINOR.PATCH` primarily contains bug fixes, compatible improvements, documentation, or maintenance;
- every breaking change must be explicitly called out in the release notes;
- database migrations must be documented in the relevant release section.

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

## [0.1.0] - To be released

First public development release of CartaVault.

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

### Changed

- The project is presented under the CartaVault name.
- The interface has progressively been aligned with the CartaVault visual identity.

### Security

- Versioned encryption for Google Routes credentials.
- No Google Routes key is stored in the browser.
- Credentials are removed when an account is anonymized or deleted.
- Permissions are enforced for map- and user-owned data.
- `.env` files, private keys, and secrets are excluded from the repository.

[Unreleased]: https://github.com/FlynX9/CartaVault/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FlynX9/CartaVault/releases/tag/v0.1.0
