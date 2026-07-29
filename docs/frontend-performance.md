# Frontend performance baseline

This document records the repeatable checks for issue #84. It complements
browser profiling; it does not replace profiling real user workflows on a
representative desktop with at least 500 places and a multi-day trip.

## Current strategy

- The map workspace remains mounted while workspace panels and the routed
  administration overlay change.
- Maps, Places, Trips, Media, management panels, Trash, dashboard and dialogs
  are loaded through React `lazy` boundaries with accessible loading fallbacks.
- Frequently revisited workspace state is held by the workspace shell; panels
  do not force a map reload when navigating between them.
- Resize pointer updates are coalesced with `requestAnimationFrame`. Panel
  widths are persisted only after a completed drag or keyboard change.

## Bundle report and CI budget

Build the frontend, then generate the report:

```sh
cd frontend
npm run build
npm run bundle:report
```

`dist/bundle-report.json` lists every JavaScript chunk, whether it belongs to
the static import closure of the initial Vite entry, and whether it is a lazy
entry. `npm run check:bundle` enforces the same report in CI.

The initial JavaScript closure has a 900,000 byte minified budget. The
2026-07-29 baseline is about 780,000 bytes after moving the map workspace to a
route-level lazy boundary; it keeps the dashboard, authentication and shell
fast while the map chunk begins loading when the workspace route is selected.
The report intentionally sums static dependencies as well as the entry file so
that moving code into a manually named initial chunk cannot hide a regression.
Any budget increase requires a measured justification in review.

## Performance budgets and profiling checklist

- Common panel open/return: perceived response under 250 ms on the reference
  desktop; map instance remains mounted.
- Ordinary navigation: no avoidable main-thread task over 50 ms.
- Resize: at most one React layout update per animation frame; no storage write
  for each pointer pixel.
- Returning to a fresh panel: do not reload unchanged maps or stable catalogs.

Profile Places, Trips, Media, filters, bulk edit, POI details, theme/basemap
switches and resize with React DevTools Profiler, Chrome Performance and the
Network panel. Record commit duration, remounts, requests, long tasks and lost
state before adding memoization or cache layers. Test reduced motion, keyboard
resize and permission-specific panels with the same workflows.
