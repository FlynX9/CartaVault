# Authoritative provider metering

## Security audit and accounting model

Before this change, Google Satellite tile events were counted twice: the
backend counted proxied tiles, while the browser could also post arbitrary
`tiles_started` values into the same table. Those mixed values fed the shared
disable threshold, so a modified client could disable the provider for every
user. The quota-profile model covered owned CartaVault resources but had no
provider request limits. Provider errors could also disable the integration
after the configured consecutive-error threshold.

CartaVault now treats only requests that cross its authenticated backend proxy
as authoritative. The browser telemetry endpoint has been removed. Missing,
replayed or manipulated client events therefore cannot alter usage, quotas or
availability.

Google Satellite accounting records the UTC date, user, selected credential,
quota-profile snapshot and server-observed result. It supports these scopes:

- shared instance daily and monthly ceilings from the Google Satellite settings;
- per-user daily and monthly ceilings inherited from the user's quota profile;
- provider and credential attribution for operational investigation;
- calendar-day and calendar-month periods in UTC.

The stored profile ID is historical attribution; enforcement always resolves
the user's current profile. Other proxied providers remain server-authorized
and their secrets remain behind the server boundary, but no hard usage ceiling
is currently configured for them.

## Atomic enforcement

Before sending a tile request upstream, the backend obtains a PostgreSQL
transaction advisory lock, recomputes shared and user usage, checks the next
unit and atomically upserts the reservation. This serializes the final quota
unit across Uvicorn workers and remains valid when future application replicas
share PostgreSQL. A failed upstream request still consumes one started unit,
because a real provider request occurred, and increments the failure count.

Storage-byte quotas likewise use persisted media metadata rather than local
filesystem inspection, so S3-backed media is counted authoritatively.

## Periods, warnings and reactivation

Daily periods reset at 00:00 UTC. Monthly periods reset on the first day of the
next UTC month. No counter is destructively reset: queries select the active
period, preserving history. The Admin Google Satellite panel shows current
usage, effective shared limits, blocked state and both reset dates. Warnings
appear at 50%, 80% and 95%.

A usage block clears automatically when the next period begins or an
administrator raises the ceiling. `Réinitialiser les erreurs` only clears the
provider-error state; it never edits authoritative usage. Administrators may
disable or re-enable the provider explicitly. Google Cloud metrics remain the
billing reference and should be compared with CartaVault's proxy count.

## Privacy and alerts

Usage rows contain no API key, provider session token, URL, tile coordinate or
signed media URL. Alert operational staff when usage reaches 80% and 95%, when
the provider becomes blocked, or when repeated upstream errors disable it.
