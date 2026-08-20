# Google Satellite with Maps JavaScript API

CartaVault integrates Google Satellite exclusively through **Maps JavaScript API**. CartaVault does not request, extract, proxy, cache, or prefetch Google's internal tile URLs. The former Map Tiles proxy, Google Roadmap option, tile sessions, counters and quotas have been removed.

Google is an optional satellite provider. The user chooses either ArcGIS World Imagery or Google in the satellite configuration; the map shows a single satellite button for the configured provider.

The provider migration does not replace CartaVault's map engine. Leaflet remains the interactive map and owns POIs, clusters, routes, annotations, selection, measurement, search results, keyboard interactions, and the current camera. A native, non-interactive `google.maps.Map` is inserted below the Leaflet panes only when `google-satellite` is selected. Leaflet center and zoom changes are copied to Google with `moveCamera`. Switching backgrounds hides and reuses that instance; it does not recreate the `MapContainer`, POIs, or routes.

## Google Cloud configuration

1. Enable **Maps JavaScript API** in a Google Cloud project with billing enabled.
2. Create a dedicated browser key. Restrict **Application restrictions** to the exact production and development HTTP referrers that may host CartaVault.
3. Restrict **API restrictions** to Maps JavaScript API only.
4. In **Account → API keys**, save the key as a Google credential. In the satellite preferences, select **Google**, then **Maps JavaScript API** and explicitly associate this key.
5. Enable Maps JavaScript in the administrator settings.

For a self-hosted instance, list every real origin pattern that users open, for example `https://cartavault.example.com/*`, `https://nas.example.local/*`, or the exact LAN origin such as `https://192.168.1.50/*`. Add a localhost origin only for development. Google referrer restrictions cannot be configured by CartaVault and an origin accessed by both hostname and IP needs both entries.

Do not select a server key used by Routes or Places for the JavaScript mode. A generic server-side Google verification cannot prove that a browser-restricted Maps JavaScript key works: CartaVault marks this credential verified only after the native map emits its first `tilesloaded` event.

## Credential boundary

The selected key is encrypted at rest and never written to logs, local storage, a tile URL, or the application bundle. The authenticated endpoint `/basemaps/google-satellite/maps-js/config` decrypts it only on demand and returns it with `Cache-Control: private, no-store`. This is the intentional browser-key exception to CartaVault's normal server-only credential boundary: Maps JavaScript API requires the browser to receive the key. The key is an identifier, not a secret, so provider-side HTTP-referrer and API restrictions are mandatory.

Deleting or deselecting the credential prevents new SDK initialization. Loading failures use CartaVault's existing basemap fallback without removing the user's provider or implementation choice. Production Content Security Policy allows only the official Google Maps script hosts needed by this integration. Google attribution and terms remain rendered by the native Google map.

## Troubleshooting

- **The JavaScript map reports a key/configuration error:** verify billing, Maps JavaScript API activation, the exact browser referrer, and API restriction. Reload the page after selecting or rotating the browser key because the official SDK is a singleton per page.
- **The map works but the account initially says “to verify”:** browser-restricted keys cannot be fully tested by CartaVault's server. The state becomes verified after the first native satellite map finishes loading.
- **Offline:** Google is never cached. CartaVault switches to its local vector background and restores Google after connectivity returns.

## Lifecycle and cost instrumentation

The SDK is lazy-loaded on the first Google Satellite activation. Its promise and map instance are reused for the lifetime of the Leaflet map. Development builds log `google_map_instance_created` and `google_map_instance_destroyed`; `getGoogleMapInstanceMetrics()` exposes created, destroyed, and active instance counts for deterministic tests. Pan, zoom, POI refresh, route refresh, side-panel changes, and switching away and back do not construct a new Google map.

Maps JavaScript bills **Dynamic Maps** map loads, not individual Leaflet camera synchronizations. With CartaVault's lifecycle, one page/map mount that activates Google Satellite is one expected Dynamic Maps load. As of 17 August 2026, Google's public pricing lists 10,000 free Dynamic Maps events per month and USD 7 per 1,000 events in the first paid tier. Always verify the current [Maps JavaScript pricing](https://developers.google.com/maps/billing-and-pricing/pricing) and configure Google Cloud budgets before production use.

Illustrative monthly projections, assuming no other Dynamic Maps traffic:

| Active users | 10 map sessions/user | 30 map sessions/user | 100 map sessions/user |
| ---: | ---: | ---: | ---: |
| 50 | 500 / USD 0 | 1,500 / USD 0 | 5,000 / USD 0 |
| 100 | 1,000 / USD 0 | 3,000 / USD 0 | 10,000 / USD 0 |
| 500 | 5,000 / USD 0 | 15,000 / about USD 35 | 50,000 / about USD 280 |

Counts before the slash are monthly map loads. Estimates apply the stated free allowance and first paid tier, exclude taxes/currency conversion, and are not a quote.

## References

- [EEA Map Tiles changes and Maps JavaScript migration](https://developers.google.com/maps/comms/eea/map-tiles)
- [Maps JavaScript API loading](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
- [Map types, including satellite](https://developers.google.com/maps/documentation/javascript/maptypes)
- [API security best practices](https://developers.google.com/maps/api-security-best-practices)
- [Maps JavaScript policies and attribution](https://developers.google.com/maps/documentation/javascript/policies)
- [Usage and billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing)
