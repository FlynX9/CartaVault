# Place API performance

This runbook accompanies issue #85. Measure against a dedicated benchmark
database or read replica: never seed or run `EXPLAIN ANALYZE` on a constrained
production NAS during normal use.

## Current query boundaries

- `GET /places/map` is a marker-specific projection with only marker fields,
  status/category/tag summaries, visible-bounds filtering and a hard limit.
- `GET /places` remains the richer list response. Its category-primary lookup
  is batched once per page instead of once per serialized category.
- `GET /places/facets` keeps dynamic counts permission-scoped to one map.
  Related quick counters and filtered counters each use one aggregate query;
  category/tag/status/value facet groups remain separate because their returned
  dimensions differ.
- Every list uses a deterministic ordering with `Place.id` as the tie-breaker.
  Offset pagination is bounded to 100 list items. Re-evaluate cursor pagination
  when representative plans at 10,000+ places show unacceptable deep-offset
  latency (start with offsets 1,000 and 5,000), rather than migrating by
  assumption.

## Reproducible baseline

Create three isolated maps with 500, 2,000 and (where resources allow) 10,000
places. Distribute statuses, categories, tags, regions, photos, favorites and
trip stops so filters are representative. For every size, record database plan
time, HTTP latency, response bytes, query count and process memory for the
first page, a later page, text search, each common filter, facets, list
position and map bounds.

Run the benchmark helper from `backend`. It exercises the real FastAPI
endpoints in-process, counts SQL statements, measures SQL and application /
serialization time separately, records response bytes and Python allocation
peaks, and captures representative `EXPLAIN (ANALYZE, BUFFERS)` plans:

```sh
python scripts/benchmark_place_queries.py \
  --map-id <benchmark-map-uuid> \
  --database-url <benchmark-database-url> \
  --repeats 7 \
  --output benchmark-result.json
```

The database name must contain `benchmark` or `test`. A read replica with a
different name requires the explicit `--allow-read-replica` flag. The tool
never writes data and does not include connection URLs, tokens or POI contents
in its JSON report.

## Baseline recorded on 2026-07-31

The benchmark used three isolated maps containing exactly 500, 2,000 and
10,000 places. Each place had one category and one tag; 20% had a photo and
were favorites; two statuses, 18 regions, three access / danger / condition
values and deterministic ratings were distributed through each map. Ten
percent of names matched the text-search term. Every measurement used one
warm-up followed by seven samples against PostgreSQL 16.4 / PostGIS 3.4.3 in
Docker on a Ryzen 9 3900X host with 31.9 GiB RAM.

These are warm-cache, in-process FastAPI measurements. They include dependency
resolution and response serialization, but not reverse-proxy or network
latency. `Peak KiB` is the median Python allocation peak reported by
`tracemalloc`, not whole-process RSS.

| POI | Scenario | Median total | Median SQL | Queries | Response | Peak KiB |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 500 | First page (50) | 90.41 ms | 15.15 ms | 6 | 87.0 KiB | 853.0 |
| 2,000 | First page (50) | 87.97 ms | 16.74 ms | 6 | 87.1 KiB | 852.6 |
| 10,000 | First page (50) | 106.36 ms | 36.13 ms | 6 | 87.1 KiB | 853.1 |
| 500 | Deep page (offset 400) | 84.35 ms | 14.76 ms | 6 | 85.3 KiB | 785.6 |
| 2,000 | Deep page (offset 1,900) | 91.21 ms | 22.90 ms | 6 | 85.3 KiB | 785.7 |
| 10,000 | Deep page (offset 5,000) | 139.00 ms | 71.41 ms | 6 | 85.4 KiB | 787.1 |
| 500 | Partial text search | 87.80 ms | 13.71 ms | 6 | 87.0 KiB | 882.7 |
| 2,000 | Partial text search | 89.72 ms | 16.33 ms | 6 | 87.1 KiB | 882.8 |
| 10,000 | Partial text search | 154.19 ms | 81.22 ms | 6 | 87.1 KiB | 882.5 |
| 500 | Facets | 89.93 ms | 39.36 ms | 11 | 5.1 KiB | 247.0 |
| 2,000 | Facets | 112.97 ms | 58.78 ms | 11 | 5.1 KiB | 252.8 |
| 10,000 | Facets | 218.37 ms | 165.16 ms | 11 | 5.2 KiB | 252.9 |
| 500 | Marker viewport (1° × 1°) | 49.44 ms | 7.66 ms | 7 | 1.7 KiB | 165.9 |
| 2,000 | Marker viewport (1° × 1°) | 52.36 ms | 8.14 ms | 7 | 7.3 KiB | 218.2 |
| 10,000 | Marker viewport (1° × 1°) | 78.09 ms | 17.85 ms | 7 | 37.6 KiB | 602.6 |
| 500 | Full bounds | 196.87 ms | 51.07 ms | 7 | 201.7 KiB | 2,736.9 |
| 2,000 | Full bounds | 730.04 ms | 207.21 ms | 10 | 806.8 KiB | 11,016.7 |
| 10,000 | Full bounds (capped at 5,000) | 1,958.95 ms | 571.53 ms | 16 | 2,020.8 KiB | 27,764.3 |
| 500 | List position | 38.47 ms | 6.01 ms | 4 | 0.1 KiB | 127.2 |
| 2,000 | List position | 43.23 ms | 10.39 ms | 4 | 0.1 KiB | 127.2 |
| 10,000 | List position | 72.09 ms | 38.39 ms | 4 | 0.1 KiB | 127.1 |

At 10,000 places, the median totals for region, favorite, photo, trip,
category, tag and status filters and the updated-date sort ranged from 84.18
to 109.97 ms. Query counts remained constant for every list scenario. The
10,000-place p95 values were 110.92 ms for the first page, 141.70 ms for the
deep page, 159.67 ms for search, 291.36 ms for facets and 79.99 ms for the
normal marker viewport.

The full-bounds marker result is intentionally a worst case. Its 1.39 s
application / serialization component and 2.0 MiB payload dominate the 10,000
place result. A database index cannot fix that response-volume cost; ordinary
viewport requests remain below 80 ms median.

### Query-plan evidence and index decision

| POI | First page | Deep page | Search | Facet base | Full bounds | Viewport |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 0.644 ms | 1.216 ms | 0.867 ms | 0.166 ms | 0.336 ms | 0.068 ms |
| 2,000 | 1.834 ms | 5.681 ms | 3.403 ms | 0.513 ms | 1.403 ms | 0.105 ms |
| 10,000 | 8.375 ms | 32.440 ms | 16.476 ms | 2.768 ms | 3.474 ms | 0.420 ms |

No additional database index is justified at the measured scale:

- the 10,000-place viewport plan combines `places_location_idx` (GiST) and
  `places_map_id_idx` through a `BitmapAnd`, returning 93 rows in 0.420 ms;
- PostgreSQL correctly prefers the map index for full-country bounds, where
  nearly every geometry matches and a spatial index cannot reduce the result;
- name-order pages use a sequential scan and bounded sort, but remain at
  8.375 ms for the first page and 32.440 ms at offset 5,000; the full endpoint
  remains below 140 ms median;
- partial search uses a sequential scan, but its SQL time is 16.476 ms and its
  full endpoint median is 154.19 ms. The storage and write cost of multiple
  trigram / normalized-search indexes is not warranted by this baseline;
- facet SQL is the largest normal database component, yet the complete
  10,000-place response remains 218.37 ms median with a 5.2 KiB payload.

Reconsider a partial functional name index, trigram search indexes or cursor
pagination only when maps exceed 10,000 places or these measured p95 values
cross the deployment budget. Keep the full-bounds marker cap: future work there
should reduce or aggregate the returned marker set rather than add a redundant
index.

## Index and plan review

The schema currently provides indexes for map ID, status, deleted/purge state,
map+favorite, rating sorts and a GiST geometry index. Validate that plans use
the spatial index for `ST_Intersects(location, ST_MakeEnvelope(...))`; do not
wrap the indexed `location` expression in a transforming function.

Before adding an index, attach plans for a representative query and record the
expected read benefit, index size and write cost. Search currently uses
case-insensitive partial matching across several fields and association tables;
consider `pg_trgm`/`unaccent` only after those plans identify search as a real
bottleneck. Any cache must include user/map authorization scope and a short,
measured invalidation strategy.

## Operational limits

Small self-hosted instances should keep marker limits conservative and cancel
superseded browser requests. Client cancellation does not guarantee database
cancellation, so reverse-proxy/request timeouts and PostgreSQL statement
timeouts remain deployment responsibilities. Keep maps, categories, tags and
statuses authorization-scoped; never share a place-list or facet cache between
users merely because filter parameters match.
