# Display boundaries

`display_boundaries_low.zip`, `display_boundaries_medium.zip` and
`display_boundaries_high.zip` contain zoom-specific country geometries for
CartaVault's visual outside-country mask. The generator downloads country
border extracts prepared from OpenStreetMap planet dumps and falls back to
Natural Earth 1:10m only for territories absent from that export.

The three point budgets are intentionally separate from the much lighter
Natural Earth 1:110m dataset used for route validation. Display precision can
therefore evolve without increasing routing cost or changing route semantics.

To regenerate the files:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\prepare_display_boundaries.py
```

The generated boundary data is derived from OpenStreetMap and distributed
under ODbL 1.0 with attribution to OpenStreetMap contributors. Natural Earth
fallback geometries are public domain. Regeneration is an offline maintenance
operation; the CartaVault backend never calls these providers at runtime.
Each archive contains one compressed JSON member per ISO alpha-3 code, so the
backend only expands and caches the country requested by the map.
