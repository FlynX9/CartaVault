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

Run the SQL plan helper from `backend`:

```sh
python scripts/benchmark_place_queries.py --map-id <benchmark-map-uuid>
python scripts/benchmark_place_queries.py --map-id <benchmark-map-uuid> --offset 1000
```

It runs `EXPLAIN (ANALYZE, BUFFERS)` for the default list and facet base. Save
the complete output with the dataset size and PostgreSQL version. Use the
browser Network panel or `curl -w` for endpoint latency and response size; use
the SQLAlchemy engine event hook only in a development benchmark to count SQL
statements. Do not log place contents, tokens or production connection URLs.

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
