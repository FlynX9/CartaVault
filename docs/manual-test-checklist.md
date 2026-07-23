# Manual pre-release test checklist

This checklist complements CartaVault automated tests. Run it before every release, release candidate, or significant deployment.

It does not replace unit tests, integration tests, linting, frontend builds, or Alembic checks.

## Validation information

- Version or commit tested:
- Date:
- Tester:
- Environment:
- Operating system:
- Browser:
- Deployment mode:
- Database used:
- Routing provider tested:
- Overall result: ☐ Pass ☐ Pass with reservations ☐ Blocked

## Preconditions

- [ ] The branch or commit under test is clearly identified.
- [ ] `.env` files match the test environment.
- [ ] No real secret is present in logs or screenshots.
- [ ] PostgreSQL/PostGIS is running and reachable.
- [ ] Required Alembic migrations are applied.
- [ ] Backend starts without error.
- [ ] Frontend starts without error.
- [ ] Browser console has no blocking load error.
- [ ] An administrator account is available.
- [ ] A standard user, editor, and viewer are available when permissions are tested.

# 1. Authentication and sessions

## Login

- [ ] Valid credentials open the map workspace.
- [ ] Invalid credentials show a readable error without exposing sensitive details.
- [ ] The password visibility control works and has an accessible label.
- [ ] Remembered email behavior is correct.
- [ ] Login is usable in light and dark themes and on mobile.

## Logout

- [ ] Logout clears the current session.
- [ ] Logout returns explicitly to the login page.
- [ ] Protected routes cannot be accessed after logout.
- [ ] Expired-session behavior returns to login safely.

## User account

- [ ] Profile, avatar, password, email, sessions, preferences, and account deletion restrictions behave correctly.
- [ ] Theme, language, density, routing, and basemap preferences persist after refresh.
- [ ] Account dialogs remain keyboard accessible and appear above map overlays.

# 2. Map creation and management

## Map list

- [ ] Maps show country flag, name, country, role, ownership/share state, and available actions.
- [ ] The currently open map has the active border and disabled **Open** action.
- [ ] Shared maps identify their owner and cannot be opened before invitation acceptance.

## Creation

- [ ] Country search works and country flags are visible.
- [ ] Required fields and duplicate validation are clear.
- [ ] A newly created map focuses the appropriate country bounds.

## Update and deletion

- [ ] Map settings, members, import, export, and deletion respect role permissions.
- [ ] Every destructive operation uses a CartaVault confirmation dialog, not a browser prompt.
- [ ] Deleting the active map selects a valid remaining map or safe empty state.

# 3. Place creation and editing

## Create from the map

- [ ] Right-clicking the map opens the coordinate menu.
- [ ] **Create a place here** uses the exact clicked coordinates.
- [ ] Cancelling creation removes the temporary marker.
- [ ] Copy and Google Maps actions work without blocking dialogs.

## Form

- [ ] Required fields validate correctly.
- [ ] Category, status, tags, photos, favorite, ratings, location, and optional fields save correctly.
- [ ] Interest rating appears only for unvisited status; visit rating appears only for visited status.
- [ ] Coordinates are editable and dragging the draft marker updates the form.
- [ ] The floating save action stays usable without covering fields.

## Update, delete, and trash

- [ ] Editing updates the list, popup, map marker, facets, and filters.
- [ ] Deletion uses a styled confirmation dialog.
- [ ] Restore and permanent purge follow permissions and show correct feedback.

# 4. Categories, tags, and statuses

## Categories

- [ ] Create, search, edit, delete, icon selection, and primary-category behavior work.
- [ ] Only catalog icon identifiers are accepted.

## Tags

- [ ] Create, search, edit, delete, and tag-color configuration work.
- [ ] Selected tags appear with their configured colors in places and popups.

## Statuses

- [ ] Create, edit, active/default, functional visit state, display order, and color work.
- [ ] Inactive statuses remain on existing places but cannot be chosen for new writes.
- [ ] Status colors are reflected in markers, place cards, ratings, and legend.

# 5. Photos and media

## Upload

- [ ] JPEG, PNG, and WebP validation works, including size and dimensions.
- [ ] Multiple upload, primary selection, ordering, and deletion work.

## Display

- [ ] Place popup, editor, gallery, and media workspace use thumbnails safely.
- [ ] The full-screen viewer is available only from an individual place, not from list thumbnails.

## Deletion

- [ ] Delete confirmation and storage cleanup work without leaking storage paths.

# 6. KML/KMZ import

## File selection and preview

- [ ] File selection starts analysis automatically.
- [ ] Invalid archives, paths, sizes, and XML are rejected safely.
- [ ] Preview identifies importable placemarks, warnings, duplicates, selected items, fields, and images.

## Import

- [ ] Only supported point data and `ExtendedData` are imported.
- [ ] Folder data, altitude data, KML styles, and `gx_media_links` are ignored.
- [ ] Duplicate handling and force-import actions are explicit.
- [ ] A failed remote image does not prevent valid places from importing.
- [ ] List, map, clusters, filters, and facets refresh after import.

# 7. Search, filters, and bulk actions

## Search and filters

- [ ] Text search debounces, cancels stale requests, and synchronizes list and map.
- [ ] Quick filters cover all, unvisited, visited, and favorites.
- [ ] Advanced filters cover categories, tags, statuses, regions, photos, coordinates, dates, access, danger, condition, and trip presence where configured.
- [ ] OR applies within a filter group and AND across groups.
- [ ] Filter URL parameters restore correctly after refresh and browser navigation.

## Sorting and pagination

- [ ] Sort controls apply server-side and preserve page state.
- [ ] More places load automatically when reaching the list end.
- [ ] Empty, loading, timeout, abort, and error states remain understandable.

## Bulk actions

- [ ] Selection survives filter changes for places on the same map.
- [ ] The UI reports selected places hidden by filters.
- [ ] Status, category, tag, trip, and delete actions show structured results.
- [ ] Viewer users do not see modification actions.
- [ ] Mixed-map or unauthorized selections are rejected atomically.

# 8. Trash and restoration

- [ ] Advanced filters reveal the trash only to permitted roles.
- [ ] Restore returns a place to list and map state.
- [ ] Purge requires explicit confirmation and removes the record permanently.

# 9. Sharing, members, and permissions

## Invitations

- [ ] Existing users receive an in-app invitation notification.
- [ ] A pending invitation is visible but cannot be opened.
- [ ] Unknown-email sharing proposes registration without leaking account information.

## Members

- [ ] Owner, editor, and viewer actions match the documented matrix.
- [ ] Revoking access removes the map from the target user without a disruptive global reload.

## Access control

- [ ] Direct API and UI access cannot read another user's private map, place, tag, photo, import, export, or trip.
- [ ] Errors do not expose other users' names, emails, IDs, or secrets.

# 10. History

- [ ] Place history displays authorized mutations only.
- [ ] Historic changes remain readable without exposing hidden credentials or storage paths.

# 11. Trip creation and management

## Trips

- [ ] Create, rename, duplicate, export, and delete work through CartaVault dialogs.
- [ ] A trip always has one departure, one day, and one arrival.
- [ ] Days inserted between existing days preserve the required intermediate-night structure.

## Days and stops

- [ ] Drag-and-drop, add-place, free-location, reordering, remove, departure, night, and arrival editing work.
- [ ] Hover insertion controls add a day at the requested position.
- [ ] Day colors and visibility toggles update the matching route and markers.

# 12. Route calculation and optimization

## Calculation

- [ ] A day route starts at the preceding departure/night and ends at the following night/arrival.
- [ ] Distance, driving, visits, buffers, margins, and total duration are displayed separately.
- [ ] Recommended departure has a title and uses the configured/default arrival target.

## Recalculation and optimization

- [ ] Recalculation updates the visible route and success feedback.
- [ ] Optimization requires confirmation, refreshes order and route, and does not produce duplicates.

## Country constraint and provider

- [ ] OSRM works without a Google key.
- [ ] Google Routes requires a verified personal key.
- [ ] Country constraint warnings clearly explain a route leaving the selected country.

# 13. Exports

## Trip export

- [ ] GPX and KMZ export actions respect map permissions.
- [ ] Generated files open in appropriate external tools where supported.

## External verification

- [ ] KMZ archives are valid ZIP archives and open in Google Earth.
- [ ] Exported metadata, colors, category glyphs, and place fields match the documented export scope.

# 14. Google Routes credentials

- [ ] The routing preference exposes Google Routes only with a valid configuration path.
- [ ] A personal key is mandatory and verified before Google Routes can be saved.
- [ ] Values are never shown in full after submission, stored in browser storage, or included in URLs.

# 15. Light, dark, and basemap modes

## Interface theme

- [ ] Light, dark, and system preferences persist after refresh.
- [ ] Panels, modals, forms, popups, loading, empty, and error states have accessible contrast.

## Basemaps

- [ ] Light, dark, satellite, and OSM backgrounds remain selectable independently of the interface theme.
- [ ] CartaVault overlays, markers, routes, controls, and attribution remain visible on every basemap.

# 16. Responsive behavior

## Navigation and panels

- [ ] Test 320 px, 375/390 px, 768 px, 1024 px, desktop, 4K, and 200% browser zoom.
- [ ] Resizable panels, collapsed Places header, map search, legend, and controls do not overlap.

## Forms, dialogs, and trips

- [ ] Forms and dialogs scroll internally without hiding primary actions.
- [ ] Trip planner remains readable and interactive on narrow screens.

# 17. Keyboard accessibility

- [ ] Tab order is logical and focus remains visible.
- [ ] Menus, dialogs, drawers, icon buttons, filters, and context menu work with keyboard.
- [ ] Escape closes temporary surfaces and restores focus appropriately.
- [ ] Controls expose meaningful accessible names and states.

# 18. Loading, empty, and error states

- [ ] Loading states do not remain stuck after closing and reopening a panel.
- [ ] Abort errors are not shown as server errors.
- [ ] Empty states distinguish no data from active filters.
- [ ] Errors provide a readable retry path without technical secrets.

# 19. Baseline security checks

- [ ] No secret appears in UI, API responses, logs, screenshots, browser storage, or URLs.
- [ ] CSRF-protected writes reject missing/invalid tokens.
- [ ] File uploads and archives reject unsafe input.
- [ ] Unauthorized or cross-map actions have no partial side effect.

# 20. Final verification

## Frontend

```powershell
Set-Location frontend
npm run verify:category-icons
npm run lint
npm run test
npm run build
```

## Backend

```powershell
Set-Location backend
python -m compileall app migrations tests
python -m pytest -m unit -v
python -m pytest -m integration -v
python -m pytest -v
python -m alembic heads
python -m alembic check
python -c "from app.main import app; print(app.title)"
```

## Git and documentation

```powershell
Set-Location ..
git diff --check
git status
git diff --stat
```

- [ ] All project Markdown is in English.
- [ ] Documentation matches the tested behavior.
- [ ] No generated storage, cache, secret, or local configuration is tracked.

# Test-campaign result

## Blocking defects

List defects that block release.

## Non-blocking defects

List accepted follow-up work and its issue reference.

## Tests not run

List every skipped check and the reason.

## Reservations

Document provider limits, environment differences, or incomplete external validation.

## Decision

- [ ] Approved for release
- [ ] Approved with reservations
- [ ] Not approved

## Validation

- Release owner:
- Date:
- Commit/tag:
