# Display boundaries

`display_boundaries.geojson` contains Natural Earth 1:10m country geometries
simplified to approximately 0.0005 degrees for CartaVault’s visual country
mask. Exceptionally complex coastlines receive additional adaptive
simplification to stay below 15,000 points per country. The file is
intentionally separate from the lighter 1:110m routing dataset.

Natural Earth data is public domain. To regenerate the file:

```powershell
backend\.venv\Scripts\python.exe backend\scripts\prepare_display_boundaries.py
```

The generator downloads the pinned Natural Earth 5.1.1 GeoJSON, retains only
ISO alpha-3 codes and geometries, and validates coverage of the CartaVault
country catalogue.
