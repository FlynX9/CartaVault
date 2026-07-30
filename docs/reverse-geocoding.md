# Reverse geocoding of place regions

CartaVault resolves the administrative region of a place server-side from its
GPS coordinates. The default provider is OpenStreetMap Nominatim; the browser
never calls it and receives only normalized, persisted values.

## Resolution and persistence

The existing `places.region` column remains the display, search, import and
export source of truth. Resolution also persists the returned country and ISO
code, the selected administrative field and level, an optional administrative
code, the provider identifier and the resolution timestamp.

Nominatim does not expose one universal “region” field. CartaVault selects the
first non-empty value in this international order:

1. `state`;
2. `region`;
3. `province`;
4. `state_district`;
5. `county`;
6. `municipality`.

This deliberately prefers first-order divisions while retaining fallbacks for
countries whose OpenStreetMap data uses a different hierarchy. Missing data is
valid and is shown as “Non déterminée”.

Resolution occurs when a place without a manual region is created, and when
its coordinates change. A normal update with unchanged coordinates reuses the
persisted value and performs no network request. Any supplied `region` value,
including an explicit empty value, is marked as manual and is never replaced by
an automatic save.

`POST /places/{place_id}/refresh-region` is restricted to map editors. It
expressly replaces a manual value using the current coordinates. Provider
timeouts and HTTP failures return a readable `503` for this explicit action.
Automatic creation and update remain successful when the provider is
unavailable; the previous value is retained and only a provider error code is
logged.

## Configuration

The backend and Docker Compose accept:

```dotenv
CARTAVAULT_REVERSE_GEOCODING_URL=https://nominatim.openstreetmap.org
CARTAVAULT_REVERSE_GEOCODING_USER_AGENT=CartaVault/1.0 (self-hosted POI manager)
CARTAVAULT_REVERSE_GEOCODING_TIMEOUT_SECONDS=8
CARTAVAULT_REVERSE_GEOCODING_MIN_INTERVAL_SECONDS=1
```

Set a clearly identifiable User-Agent for public Nominatim. The URL may target
a self-hosted compatible instance. The in-process provider serializes requests
and respects the configured minimum interval. Persisted place fields are the
cache, so viewing a place never triggers Nominatim.

## Existing places

Migration `b8d2e5f7c310` preserves every existing `region` and marks non-empty
legacy values as manual. It does not issue network requests.

Administrators can progressively process unresolved places:

```powershell
python -m app.cli refresh-regions --limit 100
```

The command selects only active places with coordinates, no region and no
manual override. It commits each successful result, is safe to rerun, and uses
the same rate limit as interactive resolution. Failures remain eligible for a
later run.

After installing the region-resolution migration, administrators can backfill
every legacy place that has never been resolved automatically, including
places whose old region value was preserved as manual:

```powershell
python -m app.cli refresh-regions --all --limit 1000
```

Successful places receive a resolution timestamp, so this full backfill is
safe to rerun and does not request the same place twice. The per-place
“Recalculate from coordinates” action remains available to deliberately
refresh an already resolved or manually corrected value.

## Known limits

- Administrative quality depends on OpenStreetMap coverage and tagging.
- One application process coordinates its own rate limit; multi-worker public
  deployments should use a self-hosted provider or a shared job queue.
- Existing manual regions cannot be matched reliably to provider metadata and
  intentionally remain manual until an explicit recalculation.
