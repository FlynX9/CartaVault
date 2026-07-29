# CartaVault mapping frontend

The CartaVault frontend is a Vite, React, and TypeScript application built around a persistent Leaflet map. Workspace panels, dialogs, menus, and overlays reuse the CartaVault visual system and support light and dark themes.

## Initial instance setup

Before the first administrator exists, the application displays the protected
six-step setup wizard instead of authentication or workspace routes. It
verifies the one-time infrastructure token and backend prerequisites, then
configures the administrator, instance defaults, optional Resend delivery, and
mapping defaults. Once complete, the backend reports a locked setup state and
the wizard cannot be reopened. See
[`../docker/README.md`](../docker/README.md) for secret generation and
deployment instructions.

## Authentication and private sharing

Authentication uses server sessions and CSRF protection. The app provides login, administrator-approved registration, password reset, account management, notification inboxes, map invitations, and map sharing. The user menu exposes account options, API documentation, administration for administrators, theme controls, and logout.

Private maps are the default. Owners, editors, and viewers see only actions permitted by their map role. A pending invitation remains visible but cannot be opened until it is accepted.

## Photos and media

Place forms support JPEG, PNG, and WebP uploads, a primary photo, ordering, and deletion. The media workspace is a responsive, permission-aware grid across accessible maps. It uses derived thumbnails, supports filtering and pagination, and never exposes storage paths.

## KMZ import and export

KMZ import is a preview-first workflow: selecting a file starts analysis, shows importable placemarks, duplicate warnings, images, and mapped fields, then performs an atomic confirmation. Only supported KML data and `ExtendedData` are retained; archive metadata such as `gx_media_links` is ignored. Failed remote images do not cancel valid place imports.

KMZ, GPX, and trip exports use the existing map and trip data. Exports are permission-aware and should be validated externally before publishing a workflow as production-ready.

## Statuses and markers

Map-scoped statuses define marker colors and the functional visit state. Categories use the shared local icon catalog; the primary category supplies the marker glyph. The map has a compact hover-expanded legend, clustering that separates markers at maximum zoom, and a place popup with place details and safe actions.

The Places list offers compact and enriched layouts, search, visit/favorite quick filters, advanced filters, URL persistence, pagination/infinite loading, multi-selection, bulk actions, and synchronization with map markers and clusters.

## Maps and country focus

Each map belongs to a country. Opening a map centers and zooms to the country bounds while retaining the chosen basemap, visible map data, and Leaflet instance. Country flags are displayed in map lists and workspace headers.

## Prerequisites

- Node.js and npm;
- backend API running locally or a configured reachable API.

## Installation

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env
```

Keep `.env` untracked. Leave `VITE_API_BASE_URL` empty for the local Vite proxy to `http://127.0.0.1:8000` unless a different API origin is intentionally configured.

## Application theme

CartaVault supports light, dark, and system preferences. The selection is persisted per user and also applied before application rendering to avoid an obvious theme flash. Every panel, form, modal, popup, loading state, empty state, and error state must follow the active theme.

## Basemaps

The Leaflet map keeps CartaVault overlays while supporting configurable basemaps:

- CartaVault Light, using OpenFreeMap vector tiles and the locally hosted light style;
- CartaVault Dark, using OpenFreeMap vector tiles and the locally hosted dark style;
- OpenStreetMap Standard raster fallback;
- Satellite.

OpenFreeMap does not require an API key, account, or usage-based billing. Tile and style URLs are configurable via environment variables. Attribution remains visible. A future deployment may self-host OpenFreeMap or migrate to PMTiles without replacing Leaflet.

The application interface theme and selected basemap are independent. A light interface defaults to the light basemap and a dark interface defaults to the dark basemap only until the user explicitly changes the map background.

## CartaVault shell

The application shell provides:

- compact left navigation grouped into mapping, media, and organization;
- a top bar with brand, notifications, user menu, and theme switch;
- resizable, collapsible workspace panels;
- a persistent map canvas beneath floating panels;
- responsive panel behavior on tablet and mobile.

Panels include Maps, Places, Categories, Tags, Statuses, Trips, Media, Trash,
and Administration. The Places panel collapses to a compact header rather than
unmounting its list and map state.

## Home dashboard

The authenticated `/dashboard` route is the default landing page. It uses the
existing application shell and exposes responsive KPI cards, status/country/
category summaries, recent places and trips, actionable data-quality counts,
and a lightweight Leaflet preview. Quick actions delegate to the existing map,
place, KMZ, and trip workflows instead of duplicating dialogs or mutations.

Dashboard writes follow the active map permissions: viewers keep the read-only
overview but do not receive place, import, or trip creation actions. Loading,
empty, and error states are localized and support both themes. The map preview
aggregates coordinates and does not load the complete place collection.

## Geographic search and context actions

The map search uses existing geocoding services and retains its independent temporary marker. A right-click map context menu provides safe actions to create a place at the clicked coordinate, copy coordinates, or open Google Maps. It is keyboard accessible through the map-centre action and closes on movement, zoom, Escape, or action selection.

## Local development

```powershell
npm run dev
```

Vite displays the local URL, usually <http://localhost:5173>.

## Scripts

```powershell
npm run verify:category-icons
npm run lint
npm run test
npm run build
```

GitHub Actions installs this dependency tree exclusively with `npm ci`, then
runs all four validation commands. The committed lockfile is also audited on
pull requests and weekly. See
[`../docs/dependency-security.md`](../docs/dependency-security.md) for the
severity policy and local reproduction command.

## Routes

The authenticated workspace is URL-driven. Map, place, status, and filter state use readable query parameters. Direct place URLs restore the popup or editor in the persistent map workspace. Public routes include registration, password reset, and invitation acceptance.

## Account

The user menu opens the **Account** dialog above Leaflet. It includes Profile,
Avatar, Security, Sessions, Preferences, and a danger zone. Preferences include
language, display density, routing provider, map background, theme, and the
retention period used for newly deleted resources.

## Trash workspace

The **Trash** entry under Organization combines deleted maps, places, and trips
in one responsive panel. Type filters are local and immediate. Each row shows
its source map, deletion date, remaining retention, restore action, and a
separately confirmed permanent-delete action. Restoration refreshes the
workspace without remounting the Leaflet map.

## Trip mode

**Trips** is not a standalone modal. It keeps Places on the left and the persistent main map in the center while opening the trip planner on the right. Available places can be dragged into a day; used places are indicated in the list. The map overlays day routes, numbered stops, nights, departure, and arrival, highlighting the active day while attenuating the others.

Trips distinguish raw route distance and driving time from visit duration, buffers, safety margin, and estimated total time. Each day can have a custom route color and visibility toggle. A trip-only view hides unrelated places and fits the map to the trip bounds.

Google Routes is optional. The **Account → Preferences → Routing** section allows a user to select OSRM or Google Routes, enter a personal key, and verify it before saving. Keys are never stored in browser storage or returned by the API in full.

## Filters and multi-selection

The Places panel combines text search, quick visit/favorite filters, advanced filters, sorting, facets, URL persistence, and map synchronization. The list and map share the same serialized filter model. Multiple selections apply only to items explicitly selected, including selected items currently hidden by active filters; changing map clears the selection.

Bulk actions honor owner/editor permissions and include status, category, tag, trip, and delete actions. The backend remains authoritative and rejects mixed-map or unauthorized selections atomically.

## Administration

The protected `/admin` route opens an accessible responsive dialog over the persistent map. It contains Users, API Keys, Quotas, and Instance Status. It is available only from an administrator's user menu and follows the active theme.

## Limitations

- CartaVault uses local file storage by default.
- External routing and geocoding providers may impose their own availability and quota limits.
- Full production deployment, monitoring, backups, and object storage remain deployment responsibilities.
