# Optional Google Satellite basemap

CartaVault supports an optional satellite basemap through the official Google Maps Platform **Map Tiles API**. It is disabled until an administrator saves a browser key, verifies it and explicitly enables the layer in **Administration → API keys**. The normal CartaVault and OpenStreetMap layers remain the default and the current map viewport and overlays are preserved when a satellite session fails.

## Google Cloud configuration

Create a dedicated key, enable only **Map Tiles API**, and apply HTTP referrer restrictions for every CartaVault origin. Do not reuse a server-side Routes or Places key. CartaVault stores the key encrypted, displays only its last four characters in administration, creates short-lived `createSession` sessions, shows Google attribution, and never caches or prefetches Google tiles.

The local counters record only date, internal user identifier, sessions and aggregate initiated/completed/failed/cancelled tile counts. They never retain keys, session tokens, tile URLs or coordinates. Alerts are exposed at 50%, 80% and 95% of the configured daily or monthly estimates. The layer can be disabled automatically when the configured percentage or repeated-error threshold is reached. Google Cloud billing and Maps metrics remain authoritative; the administration panel links to that console instead of presenting delayed local counts as invoices.
