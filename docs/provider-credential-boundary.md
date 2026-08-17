# Provider credential boundary

CartaVault treats saved Google, Stadia and OpenRouteService credentials as server-only secrets by default. They are encrypted at rest and are accepted by the browser only during a create or replace operation. Read APIs expose identifiers, verification state and the last four characters, never the stored value. The sole basemap exception is a key explicitly selected for Google Maps JavaScript: that provider requires its browser-restricted key in the browser.

## Request strategies

| Capability | Browser-visible request | Server-side provider request |
| --- | --- | --- |
| Google Routes | Route options and coordinates sent to CartaVault | CartaVault injects the selected Google credential |
| OpenRouteService | Route options and coordinates sent to CartaVault | CartaVault injects the selected ORS credential |
| Google Places | Search text and country sent to CartaVault | CartaVault injects the selected Google credential |
| Stadia Places | Search/reverse parameters sent to CartaVault | CartaVault calls the fixed Stadia EU endpoint and injects the selected credential |
| Stadia Maps | Authenticated CartaVault tile path | CartaVault validates the style and tile coordinates, then calls the fixed Stadia tile host |
| Google Map Tiles | Authenticated CartaVault tile path plus opaque `HttpOnly` session cookie | CartaVault creates the provider session and injects the credential for every tile |
| Google Satellite / Maps JavaScript | Official Google SDK receives a dedicated HTTP-referrer-restricted browser key from an authenticated, `private, no-store` configuration response | CartaVault stores the key encrypted and records successful native map initialization; it never derives or proxies Google tile URLs |

The proxy endpoints use fixed provider hosts and allowlisted path values, so they cannot be repurposed as arbitrary fetch proxies. Requests are scoped to the authenticated account and to the credential selected in that account's preferences. Cross-account credential identifiers and Google tile sessions are rejected.

## Caching and revocation

Provider responses containing personalized access are marked `private, no-store`. Google session cookies are encrypted, time-limited, inaccessible to JavaScript and contain the user and credential identifiers. The server verifies those identifiers against the current selection for every tile, so deletion, rotation or preference changes revoke access without waiting for cookie expiry.

## Abuse and errors

Routing, search and tile proxies apply per-user burst limits. Redis provides shared counters when background infrastructure is configured; the process-local limiter is a development fallback. Upstream error bodies and signed URLs are not relayed. CartaVault returns stable error codes and does not include credentials in application logs.

Provider terms, billing quotas and authoritative usage remain controlled by the corresponding provider console. Operators should restrict each key to the minimum required APIs, configure provider-side budgets and rotate a key immediately if exposure is suspected. A Google Maps JavaScript key must be dedicated to that API and restricted to the exact CartaVault HTTP referrers; it must not be reused as a server credential for Routes, Places, or Map Tiles.
