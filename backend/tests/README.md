# CartaVault backend tests

Trip tests verify provider raw metrics (meters and seconds), visits, buffers, margins, estimated duration, midnight transitions, recommended departure, estimated arrival, day-load thresholds and colors, empty trips, stale or route-less days, partial totals, and optimization distance/duration comparisons. `test_trip_time_planning_migration.py` runs the previous-revision → upgrade → downgrade → final-upgrade cycle exclusively against `cartavault_test`.

`test_account.py` covers personal profiles, sensitive changes, no secrets in sessions, and anonymization. Every integration operation uses `TEST_DATABASE_URL` exclusively.

## Multi-user security

The suite covers sessions, cookies, CSRF, active/inactive accounts, last-administrator protection, map roles, invitations, ownership transfer, anti-IDOR behavior, map-scoped categories/tags, and temporary import/export isolation.

Destructive scenarios and Alembic cycles require `TEST_DATABASE_URL` to target exactly `cartavault_test`; the database name is printed alone before the operation. They must never use `DATABASE_URL` or run against `cartavault`.

The multi-user migration cycle is previous revision → `d8f4a2c7e910` → bootstrap test administrator and map assignment → `e5b9c3d1a742` → downgrade → final upgrade. The test database is restored to `head` after verification.

## Status and migration tests

Category-icon and `place_categories.is_primary` migrations must be cycled only with `TEST_DATABASE_URL` targeting `cartavault_test`. Never run a downgrade against `cartavault`.

Unit tests cover slug and color normalization. Integration scenarios cover CRUD, the single default, deletion conflicts, place assignment, and map filtering. They require a dedicated `TEST_DATABASE_URL`.

The `upgrade → downgrade → upgrade` Alembic cycle must run only on `cartavault_test`: downgrade removes `places.status_id` and therefore loses status associations. Never run that cycle against a development database.

## Country and map scenarios

Integration tests cover the country catalog, map CRUD and conflicts, place creation, and `map_id` filtering. Alembic cycles must target a dedicated database such as `cartavault_test`, never a development database containing data. Migrations reject unknown historic `places.country` values and verify that no place retains a null `map_id`.

## Test types

- the `unit` marker covers health checks, photo storage, configuration validation, and the strict `shared/category-icons.json` loader without opening PostgreSQL;
- the `integration` marker exercises place, tag, photo, authentication, map, and trip routes with a separate PostgreSQL/PostGIS database.

Category-icon tests accept only qualified identifiers from the shared catalog for new writes. Historic Lucide values remain readable until a dedicated migration is applied, but are no longer accepted for writes.

The `f3a7c1d9e842` migration test first prints only the target database name and requires exactly `cartavault_test`. It prepares 17 Lucide values, one unknown value, and one Iconify ID, then runs `upgrade → downgrade → upgrade`. Its downgrade is documented as destructive for Iconify IDs without a Lucide equivalent. Never run it against `cartavault`.

Without `TEST_DATABASE_URL`, integration tests are skipped with an explicit reason and never fall back to `DATABASE_URL`.

## Create the PostGIS test database

The `postgres` service defined in `docker-compose.yml` can host a separate database without deleting or modifying `cartavault`. From `backend`:

```powershell
docker compose -f ..\docker-compose.yml up -d postgres
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d postgres -c "CREATE DATABASE cartavault_test;"
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d cartavault_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker compose -f ..\docker-compose.yml exec postgres psql -U poi_user -d cartavault_test -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Database creation is needed once. If it already exists, run only the idempotent extension commands.

Set the test-only connection in the current terminal, replacing the example password:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://poi_user:change_me@localhost:5432/cartavault_test"
```

The suite requires PostgreSQL, verifies PostGIS, requires a database name containing `test`, and rejects an URL pointing to the same host, port, and database as `DATABASE_URL`.

## Temporary schema preparation

The first Alembic migration is an empty baseline, so `alembic upgrade head` cannot build the historical schema alone on a fresh database. For the current suite, the session fixture:

1. strictly validates `TEST_DATABASE_URL`;
2. verifies that PostGIS is installed;
3. loads all models through `app.main`;
4. calls `Base.metadata.create_all()` only in the test database.

The suite never drops tables and does not apply migrations in its general fixture. This is temporary until migrations can reconstruct the entire schema from a fresh database.

## Isolation and cleanup

Every integration test opens an external connection and transaction. The SQLAlchemy session uses `join_transaction_mode="create_savepoint"`, which allows route code to call `commit()` while preserving the final rollback of the external transaction.

Uploads use `tmp_path` through `PHOTO_STORAGE_PATH`. No test writes to `backend/storage/photos`, and the fixture fails if a temporary file remains at the end of a test.

Pytest creates `tmp_path` files under `backend/.pytest_tmp`, which it automatically removes and recreates for every run. Tests therefore do not depend on `%TEMP%`. `.pytest_tmp` and `.pytest_cache` are local artifacts and must not be tracked.

If an abrupt stop leaves an inconsistent cache or temporary directory, remove only these artifacts from `backend` and rerun pytest:

```powershell
Remove-Item -Recurse -Force .pytest_tmp,.pytest_cache -ErrorAction SilentlyContinue
```

## Commands

From `backend`:

```powershell
python -m pytest -m unit
python -m pytest -m integration
python -m pytest
```

Without `TEST_DATABASE_URL`, unit tests succeed and integration tests are skipped with the explicit reason defined in `tests/conftest.py`. With a correctly configured dedicated database, the complete suite runs all expected tests.

> Never use the development database URL as `TEST_DATABASE_URL`. The suite does not delete databases, containers, or volumes.

## Routing and borders

`test_country_route_validator.py` uses synthetic local polygons. It verifies geometry densification, tolerance near a border, and rejection of a genuinely outside segment without relying on an external mapping service.

## Map markers, filters, and bulk actions

Map metadata tests (`include_meta=true`) must use `cartavault_test` and verify account, limit, and `truncated`. Integration tests validate shared filters and atomic bulk deletion, always against `cartavault_test`.

## Google routing tests

Credential tests cover Fernet encryption, integrity, a wrong master key, format version, absence of secrets in errors, masked API lifecycle, CSRF, replacement, mocked verification, deletion, and user isolation. Test keys are explicitly fake; no real Google call is performed.

Google tests use mocked HTTP responses only. They cover field masks, options, polyline decoding, durations, errors, and the 25-intermediate limit. Persistence and migration integrations must use only `TEST_DATABASE_URL` pointing at `cartavault_test`.

Advanced integration scenarios cover configurable fields, favorites, both ratings, derived visited status, shared list/map filters, HTTP(S) links, history, and the trash/restore/purge lifecycle. Alembic cycles must run only after `TEST_DATABASE_URL` validation confirms that the database name contains `test` and is not `cartavault`.

Status tests also cover four defaults on a new map, `functional_state` validation, immediate reclassification, favorite/state/status combinations, facets, map isolation, and owner/editor/viewer/unrelated-user roles. The targeted `d6f1a3b8c902` migration cycle verifies downgrade to `a4f9c2e7d631`, removed columns and indexes, then backfill and final schema after returning to head.

## Quota profiles

`test_quota_profiles.py` covers administrator authorization, lifecycle, unlimited and zero values, case-insensitive uniqueness, the one default profile, system-profile protections, assignment, and transactional creation blocking. Integration tests must load `backend/.env`, print only the database name through `make_url`, and refuse every target other than `cartavault_test`. The expected cycle is `upgrade head`, `downgrade -1`, `upgrade head`, then `alembic check`.

## Media coverage

Media integration tests verify pagination and derived thumbnails, assert that storage paths are not exposed, and cover owner, viewer, and unrelated-admin access. Database tests must continue to run only against the validated `TEST_DATABASE_URL`; generated source files and thumbnail derivatives are removed before the photo-storage fixture completes.
