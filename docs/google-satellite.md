# Optional Google Satellite basemap

CartaVault supports an optional satellite basemap through the official Google Maps Platform **Map Tiles API**. An administrator controls the global activation and local usage thresholds. Each user then saves and verifies their own Map Tiles key in **Account → API keys → Basemaps**. The normal CartaVault and OpenStreetMap layers remain the default and the current map viewport and overlays are preserved when a satellite session fails.

The same **Basemaps** group offers an optional personal **Stadia Maps** key. Without it, Stadia satellite tiles use public access. With a verified key, tile requests use the user's Stadia plan. CartaVault no longer accepts a global `VITE_STADIA_MAPS_API_KEY`; the Docker image therefore contains no shared Stadia credential.

## Google Cloud configuration

Create a dedicated key, enable only **Map Tiles API**, and apply HTTP referrer restrictions for every CartaVault origin. Do not reuse a Routes or Places key. CartaVault stores each user's key encrypted, only returns its last four characters in the account panel, creates short-lived `createSession` sessions, shows Google attribution, and never caches or prefetches Google tiles.

The local counters record only date, internal user identifier, sessions and aggregate initiated/completed/failed/cancelled tile counts. They never retain keys, session tokens, tile URLs or coordinates. Alerts are exposed at 50%, 80% and 95% of the configured daily or monthly estimates. The layer can be disabled automatically when the configured percentage or repeated-error threshold is reached. Google Cloud billing and Maps metrics remain authoritative; the administration panel links to that console instead of presenting delayed local counts as invoices.
