# Provider credential boundary

CartaVault treats saved Google, Stadia and OpenRouteService credentials as server-only secrets by default. They are encrypted at rest and are accepted by the browser only during a create or replace operation. Read APIs expose identifiers, verification state and the last four characters, never the stored value. The sole basemap exception is a key explicitly selected for Google Maps JavaScript: that provider requires its browser-restricted key in the browser.

## Request strategies

| Capability | Browser-visible request | Server-side provider request |
| --- | --- | --- |
| Google Routes | Route options and coordinates sent to CartaVault | CartaVault injects the selected Google credential |
| OpenRouteService | Route options and coordinates sent to CartaVault | CartaVault injects the selected ORS credential |
| Google Places | Search text and country sent to CartaVault | CartaVault injects the selected Google credential |
| Stadia Places | Search/reverse parameters sent to CartaVault | CartaVault calls the fixed Stadia EU endpoint and injects the selected credential |
| Google Satellite / Maps JavaScript | Official Google SDK receives a dedicated HTTP-referrer-restricted browser key from an authenticated, `private, no-store` configuration response | CartaVault stores the key encrypted and records successful native map initialization; it never derives or proxies Google tile URLs |
| OpenFreeMap Light / Dark | The browser loads the public style and vector resources directly from OpenFreeMap | No CartaVault proxy and no credential |
| ArcGIS World Imagery | The browser receives a short-lived ArcGIS session, then loads imagery directly from ArcGIS | CartaVault creates only the short session; imagery never transits through CartaVault |

Server-side routing and search requests use fixed provider hosts and allowlisted path values, so they cannot be repurposed as arbitrary fetch proxies. Requests are scoped to the authenticated account and to the credential selected in that account's preferences. Cross-account credential identifiers are rejected.

## Caching and revocation

Provider responses containing personalized access are marked `private, no-store`. The Google Maps JavaScript configuration and ArcGIS session responses are short-lived and never cached by shared intermediaries. Deleting, rotating or deselecting a credential prevents a new Google SDK initialization.

## Abuse and errors

Routing and search proxies apply per-user burst limits. Redis provides shared counters when background infrastructure is configured; the process-local limiter is a development fallback. Upstream error bodies and signed URLs are not relayed. CartaVault returns stable error codes and does not include credentials in application logs.

Provider terms, billing quotas and authoritative usage remain controlled by the corresponding provider console. Operators should restrict each key to the minimum required APIs, configure provider-side budgets and rotate a key immediately if exposure is suspected. A Google Maps JavaScript key must be dedicated to that API and restricted to the exact CartaVault HTTP referrers; it must not be reused as a server credential for Routes or Places.
