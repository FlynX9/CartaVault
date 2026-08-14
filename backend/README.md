# CartaVault backend

The backend is a synchronous FastAPI application organized by feature. It uses SQLAlchemy 2, Pydantic 2, PostgreSQL/PostGIS, and Alembic.

The `app/instance_status` module exposes cached administrative diagnostics through `GET /admin/console/instance` and a forced refresh through `POST /admin/console/instance/refresh`. It does not perform billable Google Routes or Resend calls and does not expose secrets. See [`../docs/instance-status.md`](../docs/instance-status.md).

Place-list, facet, marker and query-plan baselines are documented in
[`../docs/place-api-performance.md`](../docs/place-api-performance.md).

The `/account` router manages personal profile data, email and password changes, active sessions, avatars, and controlled account deletion. JPEG/PNG/WebP avatars are decoded with Pillow, center-cropped to 256×256 WebP, stripped of metadata, and stored under `AVATAR_STORAGE_PATH` (5 MiB and 4096 px maximum). Deletion refuses map owners and the last active administrator, revokes sessions, and anonymizes the account.

## Registration and email

`POST /auth/register` stores a pending registration request without creating a `users` row. An administrator accepts or declines the request through `/admin/registration-requests`; a user is created and activated only when accepted. Password reset always returns a generic response, uses a single-use hash-only token, and revokes sessions after confirmation.

The Resend key is entered from Administration and encrypted with `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`; the API returns only its suffix. Both full-access and send-only Resend keys are supported. Verification sends a real localized CartaVault test email to the authenticated administrator and succeeds only when Resend accepts it. `EMAIL_FROM_ADDRESS` must use a domain verified in the corresponding Resend account; an empty reply-to address is omitted from provider requests. Other non-secret settings are `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `FRONTEND_PUBLIC_URL`, `PASSWORD_RESET_TOKEN_TTL_MINUTES`, and the bounded provider timeout/retry settings. Each email flow has versioned CartaVault HTML and text templates under `app/emails/templates/`, with `.en` and `.fr` variants. Registration-request language is retained until approval; invitations use the recipient language when an account exists, and password/security messages use the account preference.

CartaVault supports Resend and generic SMTP transports;
`EMAIL_PROVIDER=none` explicitly disables delivery. Map shares and important
account-security changes are sent after their database transaction commits, so
an unavailable provider cannot undo the user action. Configuration, the event
list and the shared bounded retry policy are documented in
[`../docs/transactional-email.md`](../docs/transactional-email.md).

## Authentication, roles, and security

The API uses opaque sessions stored in `user_sessions`. Only SHA-256 fingerprints of session, CSRF, and invitation tokens are persisted. The session cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and its `Secure` flag is controlled by `CARTAVAULT_COOKIE_SECURE`. The frontend sends the readable CSRF token in `X-CSRF-Token` for every write. Passwords use Argon2id and are never returned by the API.

### Session activity write precision

`last_used_at` is an operational activity indicator, not the source of session
validity. Absolute expiry (`expires_at`), account activation, logout, explicit
revocation, administrator revocation, and password-change revocation are still
checked on every request.

Activity persistence is coalesced with a five-minute precision by default,
configured through `CARTAVAULT_SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS`.
The session list can therefore display activity up to that interval behind the
latest request. The update is conditional and monotonic: concurrent requests
cannot replace a newer persisted timestamp with an older observation.

Representative authenticated navigation was measured with 21 consecutive
`GET /auth/me` requests followed by `GET /account/sessions`:

| Implementation | `user_sessions.last_used_at` updates |
| --- | ---: |
| Previous per-request persistence | 22 |
| Coalesced persistence after an aged timestamp | 1 |
| Further requests inside the five-minute window | 0 |

The repeated active-session lookup shared by authentication and CSRF validation
is centralized in `app.auth.sessions.load_active_session`. The two identical
invalid-CSRF branches use one error helper; other authentication validation
branches were reviewed and retained because their public status or message
semantics differ.

All maps are private. The V1 matrix is:

- `owner`: content, import/export, members, deletion, and transfer;
- `editor`: content, photos, categories/tags, import, and export;
- `viewer`: read and export only;
- global administrator: full access and administration.

An inaccessible private resource returns `404` to avoid revealing its existence; a forbidden action on a visible map returns `403`. Server-side checks cover indirect resources as well: places, photos, categories, tags, import previews, and temporary exports.

## First administrator and upgrade sequence

Alembic is the sole application-schema source. A clean database is upgraded
directly to all heads:

```powershell
python -m alembic upgrade heads
python -m app.cli create-admin
```

The interactive command masks the password and is intended for local
development or recovery. Automated deployments use:

```powershell
python -m app.deployment migrate-and-bootstrap
```

The deployment command waits for a stable database connection, holds a
PostgreSQL advisory lock, prepares the authentication schema when upgrading a
pre-authentication database, and applies every Alembic head. On a clean
installation it deliberately allows the administrator bootstrap to be
deferred to the one-time `/setup` web wizard. The wizard is protected by
`CARTAVAULT_SETUP_TOKEN`, rate limited, and becomes unavailable as soon as an
active administrator exists. The optional `CARTAVAULT_BOOTSTRAP_ADMIN_*`
variables remain supported for legacy unattended upgrades and are never
printed.

Legacy ownership validation remains strict when historical maps exist:
orphaned maps or divergent owner memberships stop the migration rather than
being modified partially.

## Security configuration

In addition to `DATABASE_URL`, configure the persistent
`CARTAVAULT_SESSION_SECRET`, `CARTAVAULT_SETUP_TOKEN`,
`CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`, the environment-specific session and
CSRF cookie names, `CARTAVAULT_INVITATION_HOURS`,
`CARTAVAULT_COOKIE_SECURE`, `CARTAVAULT_PASSWORD_MIN_LENGTH`, and Argon2
settings. In production, set `CARTAVAULT_COOKIE_SECURE=true` behind HTTPS.

Invitations are valid for seven days by default. Ownership transfer is transactional: the new owner must already be a member and the former owner becomes an `editor`.

## KMZ import

`app/imports/` provides a write-free preview followed by atomic confirmation. The `defusedxml` parser rejects DTDs and external entities. `doc.kml` is preferred; otherwise the lexically first KML file is used. Unmapped data is retained in `places.custom_fields`; valid local images reuse the existing secure photo storage.

Configurable limits include `KMZ_MAX_UPLOAD_SIZE` (25 MiB), `KMZ_MAX_UNCOMPRESSED_SIZE` (100 MiB), `KMZ_MAX_ENTRIES` (750), `KMZ_MAX_PLACEMARKS` (1000), and `KMZ_MAX_IMAGES` (500). Identical references are deduplicated. Progressive confirmation downloads each remote URL once and converts image failures to warnings without cancelling created places.

## Background tasks

The current single-instance mode intentionally runs without Redis or a worker.
The adoption contract, security model, and migration path for persistent KMZ
and export jobs are documented in [`docs/async-task-architecture.md`](../docs/async-task-architecture.md).

## Place statuses, categories, and icons

Statuses are scoped to a map and include a functional visit state (`unvisited` or `visited`), an active flag, a default flag, display order, and color. A map receives editable defaults when created. Inactive statuses stay attached to existing places but cannot be selected for new writes.

Categories and tags are map-scoped. Categories use the shared closed catalog of roughly 1,500 curated icons in `shared/category-icons.json`; this same file is the backend allowlist and the frontend generation source. All 300 historical IDs are retained in `shared/category-icons.legacy.json`. Arbitrary Iconify IDs, SVG/HTML, URLs, data content, and network icon lookup are rejected. Additions must use a locally installed MDI or supported historical Material Symbols module, include group/search metadata, and be regenerated and checked with `npm run generate:category-icons` and `npm run validate:category-icons` from `frontend`. The primary category determines the marker icon and the status determines its color. Tags may have a configured display color.

## Country → maps → places model

Countries come from the local catalog. Each map belongs to one country, and every place, category, tag, trip, photo, import, and export is constrained to a compatible map. Country boundaries are used for map focus and optional route-country validation.

Place regions can be resolved server-side from GPS coordinates through
Nominatim, persisted without replacing legacy manual values, and refreshed by
map editors. Configuration, normalization order, failure behavior and the
rerunnable backfill command are documented in
[`../docs/reverse-geocoding.md`](../docs/reverse-geocoding.md).

## Prerequisites

- Python 3.14;
- PostgreSQL with PostGIS and `pgcrypto`;
- Docker Desktop is recommended for local development.

## Windows PowerShell installation

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Configure `DATABASE_URL` in `backend/.env`, run `python -m alembic upgrade
heads`, then create the first administrator when installing a fresh local
instance.

## Environment variables

Keep `.env` files untracked. Required settings vary by feature, but commonly include `DATABASE_URL`, session and CSRF settings, `PHOTO_STORAGE_PATH`, `AVATAR_STORAGE_PATH`, `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`, frontend public URL, email settings, OSRM settings, and KMZ limits.

Do not put `TEST_DATABASE_URL` in production configuration. Test commands must validate it separately and use only `cartavault_test`.

## Run and Swagger

```powershell
python -m uvicorn app.main:app --reload
```

Swagger is available at <http://127.0.0.1:8000/docs>.

## Endpoint overview

Feature routers include authentication, account, users, administration, maps, countries, places, categories, tags, statuses, photos, imports, exports, media, and trips. OpenAPI is the authoritative endpoint reference.

### Dashboard aggregate

`GET /dashboard` returns one permission-scoped overview for the authenticated
account. Administrators see all maps; other users see only maps represented by
their `owner`, `editor`, or `viewer` memberships. The endpoint uses SQL
aggregations for totals, status/country/category rankings, attention counts,
recent places and trips, route summaries, and coordinate buckets. It never
loads all places into Python and never exposes counts from inaccessible maps.

The optional activity list is sourced only from persisted place-history
events. No trend or historical comparison is returned because the current
schema cannot calculate one reliably. No schema migration is required.

## Database and Alembic

The initial Alembic revision creates the historical base tables when applied to
an empty database. Later revisions evolve them to the current schema. Existing
databases already stamped with that revision do not replay it. PostgreSQL
initialization owns extensions only.

Use:

```powershell
python -m alembic heads
python -m alembic check
```

Apply migrations to a development or production database only when authorized and after a verified backup. Test upgrade/downgrade cycles exclusively in temporary PostgreSQL databases provisioned from the validated `TEST_DATABASE_URL` server; they must never downgrade the shared integration schema. CartaVault guarantees only the targeted parent/migration downgrade contracts covered by those tests, not arbitrary historical downgrade chains from the current production head. Use a verified backup and matching application release for production rollback.

Production rollout, backup, restore, rollback, Portainer, and Synology
procedures are documented in [`../docker/README.md`](../docker/README.md).
Schema changes must follow expand/deploy/contract so the previous application
image remains usable until a later contract release.

## Photos and media

Photos support JPEG, PNG, and WebP uploads, ordering, primary-photo selection, derived thumbnails, captions, and controlled deletion. Storage paths are never exposed in responses. The media workspace provides permission-aware cross-map browsing and pagination.

## Account preferences

Account preferences include language, theme, display density, map background,
trash retention, routing provider, country-routing preference, and personal
Google Routes credentials. Trash retention accepts 1 to 365 days and defaults
to 30 days. Personal Google keys are Fernet-encrypted on the server, never
returned in full, and are required and verified before Google Routes can be
selected.

## Unified trash

`DELETE` on maps, places, and trips performs a soft deletion and records the
deleting user plus a fixed `purge_after` deadline based on that user's current
preference. `GET /trash` lists only recoverable resources the current user is
allowed to manage. Typed restore and permanent-delete endpoints are available
under `/trash/{map|place|trip}/{id}`.

Normal reads, dashboard aggregates, and active-resource quotas exclude deleted
resources. Child places and trips remain intact when a map is recoverable.
Expired resources are purged transactionally during application startup and by
an hourly maintenance task. The schema change is revision `f2a6c8d4e915`.

## Trips and routing

Trips contain a departure, one or more days, intermediate nights, and an arrival. Stops can reference a place or a free location. Route calculations keep distance, driving time, visit time, buffers, safety margins, and planned time distinct. Day colors, visibility toggles, ordering, optimization confirmation, and country validation are supported.

OSRM is the default provider. Google Routes is optional, per-user, and requires an encrypted verified key. Route requests and responses are validated; no provider credential is exposed to the browser. Google optimization proposals reuse the route returned by `ComputeRoutes`, are stored temporarily in Redis, and are applied atomically without a second provider call. The distributed per-user billable-request guard defaults to 120 requests per minute and returns HTTP 429 with `Retry-After` when reached.

## Testing

From `backend`:

```powershell
python -m compileall app migrations tests
python -m pytest -m unit -v
python -m pytest -m integration -v
python -m pytest -v
python -m alembic heads
python -m alembic check
python -c "from app.main import app; print(app.title)"
```

See [`tests/README.md`](tests/README.md) for the test-database safeguards and migration guidance.

GitHub Actions runs the same checks with separate `cartavault_ci` and
`cartavault_test` PostgreSQL/PostGIS databases. Runtime Python dependencies are
audited from the pinned `requirements.txt`; development and test-only
dependencies live in `requirements-dev.txt`. See
[`../docs/dependency-security.md`](../docs/dependency-security.md) for the
failure policy and local reproduction command.

## Backend structure

```text
backend/
├── app/                 # Feature-based FastAPI modules
├── migrations/          # Alembic revisions
├── tests/               # Unit and integration tests
├── storage/             # Local generated storage, never tracked
└── requirements.txt
```

## Current limitations

- Local filesystem storage is the default; distributed deployments may need object storage.
- The instance-status dashboard is operational guidance, not a replacement for observability or backups.
- Google Routes availability, limits, and pricing remain controlled by the user's Google Cloud configuration.
- Production schema upgrades must use the documented one-shot deployment job.
