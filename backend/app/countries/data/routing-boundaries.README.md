# Routing boundaries

`routing_boundaries.geojson` is CartaVault's offline geometry dataset for the
**Stay within country** routing constraint. It contains the 173 primary
territories supported by `country-bounds.json`, including France (`FRA`).

The file is generated from Natural Earth 1:110m Admin 0 Countries vectors,
which are in the public domain. Only `iso_a3` and the `Polygon` or
`MultiPolygon` geometry are retained, so production routing does not make an
external request.

To regenerate it, optionally place the upstream GeoJSON beside this file as
`ne_110m_admin_0_countries.geojson`, then run from the repository root:

```powershell
python backend/scripts/prepare_routing_boundaries.py
```

When the source file is absent, the script downloads the fixed Natural Earth
source URL. It refuses to generate an incomplete dataset for the primary
CartaVault country catalogue.

The geometry is intentionally used only to validate an already-calculated
route. It does not replace the routing engine, and it does not cover remote or
dependent territories that are excluded from CartaVault's primary-territory
map framing.
