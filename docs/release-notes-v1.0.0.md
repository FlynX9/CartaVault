# CartaVault 1.0.0

CartaVault 1.0.0 is the first stable release of the self-hosted platform for
maps, places and trip planning. It consolidates the public beta and the five
1.0 release candidates.

## Highlights since 0.9.0-beta.1

### Maps, places and trips

- Create and organize private maps, places, categories, tags, statuses,
  annotations, photos and audit history.
- Plan multi-day trips, calculate routes with OSRM, and optionally use Google
  Routes with user-managed credentials.
- Use independently configured classic and satellite basemaps, including
  Google Maps JavaScript for EEA-compatible classic maps and resilient
  fallbacks for Google, Stadia and Mapbox providers.
- Generate and manage CartaVault offline vector basemaps, with an installable
  touch-first PWA experience for mobile use.

### Administration and collaboration

- Manage users, roles, registration review, permissions, quotas and shared
  instance API keys from the administration console.
- Configure Google, Stadia, Mapbox and OpenRouteService credentials, with
  encrypted storage and quota-profile sharing where applicable.
- Use improved diagnostics, configurable instance-log retention, privacy
  controls and public-registration settings.

### Media and interface

- Import KML/KMZ data, create places from geolocated uploads, recover photo
  GPS metadata, and configure photo compression and upload limits.
- Benefit from a responsive dark/light interface, refined mobile workflows,
  improved dialogs and accessible navigation.

### Security and operations

- Provider credentials remain server-side, are encrypted at rest, and are
  removed when accounts are anonymized or deleted.
- Release containers run as a non-root user with a read-only filesystem and
  dropped capabilities; published images include SBOM, provenance and GitHub
  attestation.
- Improved connection-pool safety and bounded provider tile traffic prevent
  basemap requests from starving application traffic.
- Production website builds are indexable, with canonical URLs, hreflang,
  `robots.txt` and XML sitemaps verified during the build.

## Upgrade notes

1. Back up PostgreSQL, uploaded media, avatars and
   `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` as one recovery set.
2. Update `CARTAVAULT_VERSION` to `1.0.0` in the deployment environment and
   redeploy with a pull of the new image.
3. Verify `/healthz`, authentication, a map, media upload and one safe write.
4. Keep the previous immutable image tag and the matching backup for rollback.

No breaking changes from the public beta are documented. Review the deployment
configuration and the full changelog before upgrading a customized instance.

**Full Changelog:** https://github.com/FlynX9/CartaVault/compare/v0.9.0-beta.1...v1.0.0
