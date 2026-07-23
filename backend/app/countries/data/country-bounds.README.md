# Country bounds

`country-bounds.json` contains primary-territory bounding boxes in
`[west, south, east, north]` order, keyed by ISO 3166-1 alpha-2 code.

Source: [sandstrom/country-bounding-boxes](https://github.com/sandstrom/country-bounding-boxes),
revision `8c9367f4e4495deee65d3d49d0cad68afc950150`.

The source data is extracted from Natural Earth 110m cultural vectors and
released into the public domain under the Unlicense. Outlying territories are
intentionally excluded so opening a map frames the country's primary area
instead of zooming out to include remote dependencies.
