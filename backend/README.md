# CartaVault backend

The backend is a synchronous FastAPI application organized by feature. It uses SQLAlchemy 2, Pydantic 2, PostgreSQL/PostGIS, and Alembic.

The `app/instance_status` module exposes cached administrative diagnostics through `GET /admin/console/instance` and a forced refresh through `POST /admin/console/instance/refresh`. It does not perform billable Google Routes or Resend calls and does not expose secrets. See [`../docs/instance-status.md`](../docs/instance-status.md).

The `/account` router manages personal profile data, email and password changes, active sessions, avatars, and controlled account deletion. JPEG/PNG/WebP avatars are decoded with Pillow, center-cropped to 256×256 WebP, stripped of metadata, and stored under `AVATAR_STORAGE_PATH` (5 MiB and 4096 px maximum). Deletion refuses map owners and the last active administrator, revokes sessions, and anonymizes the account.

## Registration and email

`POST /auth/register` stores a pending registration request without creating a `users` row. An administrator accepts or declines the request through `/admin/registration-requests`; a user is created and activated only when accepted. Password reset always returns a generic response, uses a single-use hash-only token, and revokes sessions after confirmation.

The Resend key is entered from Administration and encrypted with `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`; the API returns only its suffix. Both full-access and send-only Resend keys are supported. `EMAIL_FROM_ADDRESS` must use a domain verified in the corresponding Resend account; an empty reply-to address is omitted from provider requests. Other non-secret settings are `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `FRONTEND_PUBLIC_URL`, `PASSWORD_RESET_TOKEN_TTL_MINUTES`, and `EMAIL_PROVIDER_TIMEOUT_SECONDS`. Each email flow has versioned CartaVault HTML and text templates under `app/emails/templates/`, with `.en` and `.fr` variants. Registration-request language is retained until approval; password resets use the account preference.

## Authentication, roles, and security

The API uses opaque sessions stored in `user_sessions`. Only SHA-256 fingerprints of session, CSRF, and invitation tokens are persisted. The session cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and its `Secure` flag is controlled by `CARTAVAULT_COOKIE_SECURE`. The frontend sends the readable CSRF token in `X-CSRF-Token` for every write. Passwords use Argon2id and are never returned by the API.

All maps are private. The V1 matrix is:

- `owner`: content, import/export, members, deletion, and transfer;
- `editor`: content, photos, categories/tags, import, and export;
- `viewer`: read and export only;
- global administrator: full access and administration.

An inaccessible private resource returns `404` to avoid revealing its existence; a forbidden action on a visible map returns `403`. Server-side checks cover indirect resources as well: places, photos, categories, tags, import previews, and temporary exports.

## First administrator and upgrade sequence

Do not start an existing instance between the security migrations. Back up first, then run:

```powershell
python -m alembic upgrade d8f4a2c7e910
python -m app.cli create-admin
python -m alembic upgrade head
```

The interactive command masks the password, creates an active administrator, and assigns orphan maps with `owner` membership. It rejects an existing email. For automated deployment, temporarily set `CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL`, `CARTAVAULT_BOOTSTRAP_ADMIN_NAME`, and `CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD`, run `python -m app.cli bootstrap-admin`, then remove those secrets.

The final migration rejects a missing active administrator, orphan maps, or divergence between `maps.owner_id` and the owner membership. Historical categories and tags are copied per map to retain their previous availability and associations are remapped; new constraints and triggers reject cross-map associations. Statuses remain map-scoped.

## Security configuration

In addition to `DATABASE_URL`, configure the environment-specific `CARTAVAULT_SESSION_*`, `CARTAVAULT_CSRF_COOKIE_NAME`, `CARTAVAULT_INVITATION_HOURS`, `CARTAVAULT_COOKIE_SECURE`, `CARTAVAULT_PASSWORD_MIN_LENGTH`, and Argon2 settings. In production, set `CARTAVAULT_COOKIE_SECURE=true` behind HTTPS.

Invitations are valid for seven days by default. Ownership transfer is transactional: the new owner must already be a member and the former owner becomes an `editor`.

## KMZ import

`app/imports/` provides a write-free preview followed by atomic confirmation. The `defusedxml` parser rejects DTDs and external entities. `doc.kml` is preferred; otherwise the lexically first KML file is used. Unmapped data is retained in `places.custom_fields`; valid local images reuse the existing secure photo storage.

Configurable limits include `KMZ_MAX_UPLOAD_SIZE` (25 MiB), `KMZ_MAX_UNCOMPRESSED_SIZE` (100 MiB), `KMZ_MAX_ENTRIES` (750), `KMZ_MAX_PLACEMARKS` (1000), and `KMZ_MAX_IMAGES` (500). Identical references are deduplicated. Progressive confirmation downloads each remote URL once and converts image failures to warnings without cancelling created places.

## Place statuses, categories, and icons

Statuses are scoped to a map and include a functional visit state (`unvisited` or `visited`), an active flag, a default flag, display order, and color. A map receives editable defaults when created. Inactive statuses stay attached to existing places but cannot be selected for new writes.

Categories and tags are map-scoped. Categories use the shared closed icon catalog in `shared/category-icons.json`; arbitrary SVG, URLs, and network icon lookup are not accepted. The primary category determines the marker icon and the status determines its color. Tags may have a configured display color.

## Country → maps → places model

Countries come from the local catalog. Each map belongs to one country, and every place, category, tag, trip, photo, import, and export is constrained to a compatible map. Country boundaries are used for map focus and optional route-country validation.

## Prerequisites

- Python 3.14;
- PostgreSQL with PostGIS and `pgcrypto`;
- Docker Desktop is recommended for local development.

## Windows PowerShell installation

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Configure `DATABASE_URL` in `backend/.env`, then follow the first-administrator sequence when installing a fresh instance.

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

## Database and Alembic

The initial Alembic revision is a baseline for an existing schema. A fresh Docker volume is initialized through `database/init/001_initial_schema.sql`; Alembic then evolves the schema. Do not assume `alembic upgrade head` alone can recreate a historic fresh database.

Use:

```powershell
python -m alembic heads
python -m alembic check
```

Apply migrations to a development or production database only when authorized and after a verified backup. Test all upgrade/downgrade cycles exclusively against `cartavault_test`.

## Photos and media

Photos support JPEG, PNG, and WebP uploads, ordering, primary-photo selection, derived thumbnails, captions, and controlled deletion. Storage paths are never exposed in responses. The media workspace provides permission-aware cross-map browsing and pagination.

## Account preferences

Account preferences include language, theme, display density, map background, routing provider, country-routing preference, and personal Google Routes credentials. Personal Google keys are Fernet-encrypted on the server, never returned in full, and are required and verified before Google Routes can be selected.

## Trips and routing

Trips contain a departure, one or more days, intermediate nights, and an arrival. Stops can reference a place or a free location. Route calculations keep distance, driving time, visit time, buffers, safety margins, and planned time distinct. Day colors, visibility toggles, ordering, optimization confirmation, and country validation are supported.

OSRM is the default provider. Google Routes is optional, per-user, and requires an encrypted verified key. Route requests and responses are validated; no provider credential is exposed to the browser.

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
- Historical baseline migrations need the documented bootstrap process for a completely new database.
