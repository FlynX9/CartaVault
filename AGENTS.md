# CartaVault — AGENTS.md

## Project overview

CartaVault is a self-hosted/open-source geospatial application for managing maps, places/POIs, trips, routes, categories, tags, statuses, users, sharing and exports.

Main stack:

- Backend: FastAPI
- ORM: SQLAlchemy
- Database: PostgreSQL + PostGIS
- Geospatial layer: GeoAlchemy2
- Database migrations: Alembic
- Frontend: React
- Build tooling: Vite
- Main map stack: Leaflet / evolving mapping providers
- Deployment: Docker / Docker Compose

The application contains both user-facing and administrative functionality.

---

## Codebase structure

### Backend (`backend/`)

Synchronous FastAPI application organized by feature (Python 3.14, SQLAlchemy 2, Pydantic 2, GeoAlchemy2).

`backend/app/` contains 25 feature modules: `admin`, `annotations`, `auth`, `basemaps`, `categories`, `countries`, `dashboard`, `emails`, `exports`, `imports`, `instance_status`, `maps`, `map_profiles`, `media`, `photos`, `places`, `privacy`, `quotas`, `saas`, `setup`, `statuses`, `tags`, `tasks`, `trash`, `trips`.

Typical module layout (not every module has every file):

- `router.py` (or `<name>_router.py` for modules with several routers);
- `service.py` — business logic;
- `schemas.py` — Pydantic request/response schemas;
- `models.py` (and `associations.py` where many-to-many tables exist).

Key backend locations:

- Application assembly: `backend/app/main.py` — global CSRF dependency, CORS, `SecurityHeadersMiddleware`, routers mounted with `prefix=API_PREFIX`;
- SQLAlchemy models: one `models.py` per feature module; `backend/app/models.py` is the central registry that imports every model and must be loaded by entry points outside FastAPI (CLI, Alembic);
- FastAPI routers: the `router.py` / `*_router.py` files listed above (mounted in `backend/app/main.py`);
- Alembic migrations: `backend/migrations/versions/` (75 revisions), configuration in `backend/alembic.ini`, `backend/migrations/env.py` reads `DATABASE_URL`;
- CLI: `backend/app/cli.py` (`create-admin`, `bootstrap-admin`, `refresh-regions`), deployment bootstrap in `backend/app/deployment.py`;
- Settings: `backend/app/config.py`; environment template in `backend/.env.example`.

### Frontend (`frontend/`)

React 19 + TypeScript (strict) + Vite. Entry point `frontend/src/main.tsx`; routes are declared with `lazy()` in `frontend/src/App.tsx`.

`frontend/src/` organization:

- `components/` — 25 domain folders: `account`, `admin`, `auth`, `common`, `contact`, `dashboard`, `exports`, `geocoding`, `icons`, `imports`, `layout`, `loading`, `map`, `map-popup`, `maps`, `media`, `notifications`, `photos`, `place-list`, `places`, `privacy`, `pwa`, `sidebar`, `trash`, `trips`;
- `pages/` — route pages (including `pages/admin/`);
- `api/` — hand-written fetch wrapper `client.ts` (CSRF header, 422 field-error mapping, 401 session-expired event) plus one module per API domain;
- `i18n/` — internationalization (see below);
- `auth/`, `theme/` — providers and contexts;
- `map/`, `pwa/`, `geocoding/`, `types/` — basemaps, offline/service-worker, geocoding services, shared types.

Shared UI components live in `frontend/src/components/common/`: `ConfirmDialog`, `EmptyState`, `FieldHelp`, `GlobalFeedbackToasts`, `Skeleton`, `UnsavedChangesDialog`, `useConfirmDialog` (each with a colocated test where applicable).

Internationalization is a custom implementation (no i18next): `I18nProvider` + `useI18n()` hook (`frontend/src/i18n/`), typed message catalogs in `frontend/src/i18n/locales/{fr,en}/{account,admin,auth,common,dashboard,workspace}.ts`, aggregated in `messages.ts`. Fallback language is `fr`. User-visible text must go through `t()`.

State management uses React contexts only (`AuthContext`, `I18nContext`, `ThemeContext`, map/panel contexts); no external state library. Styling is global CSS with `--cv-*` design tokens in `frontend/src/index.css`, component classes prefixed `cv-`, light/dark themes via `[data-theme]`. Map rendering uses Leaflet + react-leaflet, MapLibre GL (`@maplibre/maplibre-gl-leaflet`) for vector basemaps and `pmtiles` for offline archives.

### Tests

- Backend: pytest 9 (`pytest==9.1.1` in `backend/requirements-dev.txt`), tests flat in `backend/tests/`. Markers declared in `backend/pytest.ini`: `unit` (never connects to PostgreSQL) and `integration` (requires a dedicated `TEST_DATABASE_URL`, validated in `backend/tests/conftest.py`).
- Frontend: Vitest with jsdom environment and setup file `frontend/src/test/setup.ts` (`frontend/vitest.config.ts`), Testing Library + jest-dom. Test files are colocated with sources using `*.test.ts` / `*.test.tsx`.

### Commands

Backend (from `backend/`):

```powershell
python -m compileall app migrations tests   # static check used as backend lint
python -m pytest -m unit -v                 # unit tests (no database)
python -m pytest -m integration -v          # integration tests (requires TEST_DATABASE_URL)
python -m pytest -v                         # full suite
python -m alembic upgrade heads             # apply migrations
python -m alembic heads                     # show heads
python -m alembic check                     # verify no pending schema changes
python -m uvicorn app.main:app --reload     # dev server (Swagger at /docs)
```

Frontend (from `frontend/`):

```powershell
npm run lint                     # oxlint (.oxlintrc.json)
npm run test                     # vitest run
npm run build                    # tsc -b && vite build
npm run check:bundle             # bundle size budget
npm run verify:category-icons    # validate category icon catalog
npm run generate:category-icons  # regenerate icon data
npm run dev                      # Vite dev server (proxies /api to 127.0.0.1:8000)
```

CI (`.github/workflows/ci.yml`) runs the same checks with Python 3.14 and Node 24, plus an Alembic upgrade/check job, a Docker container job and gitleaks.

### Conventions visible in the code

- Backend feature modules follow the `router.py` / `service.py` / `schemas.py` / `models.py` layout; business logic goes to the service layer, handlers stay thin;
- API responses use Pydantic schemas, never raw ORM models;
- inaccessible private resources return `404` (anti-enumeration), forbidden actions return `403`;
- frontend tests are colocated with the component they cover;
- user-visible strings use `t()` with keys from the locale catalogs;
- CSS relies on existing `--cv-*` tokens and `cv-` prefixed classes instead of new ad-hoc values;
- commit messages follow `feat(scope): ...` / `fix(scope): ...` / `chore(scope): ...` (English, imperative);
- Alembic is the single source of the database schema; `database/init/` only creates the `postgis` and `pgcrypto` extensions.

---

## General agent behavior

Before modifying code:

1. Inspect the relevant existing implementation.
2. Identify existing patterns and reusable components.
3. Prefer extending current architecture over introducing a new abstraction.
4. Do not perform broad refactors unless explicitly requested.
5. Keep changes scoped to the requested task.
6. Preserve backward compatibility unless the task explicitly requires a breaking change.

When the task is ambiguous, infer intent from existing code and UI patterns rather than inventing a new architecture.

Do not rewrite working modules simply because another implementation would be cleaner.

---

## Repository exploration

Before implementing a feature that touches multiple layers, inspect:

- related frontend components;
- related API endpoints;
- related schemas/types;
- database models;
- migrations;
- tests;
- shared UI components;
- existing localization keys;
- authentication and permission checks.

For bug fixes, determine the root cause before modifying code.

Do not apply speculative fixes to multiple unrelated areas.

---

## Backend rules

CartaVault backend uses FastAPI, SQLAlchemy and PostgreSQL/PostGIS.

Follow existing project patterns for:

- routers;
- services;
- dependencies;
- SQLAlchemy models;
- Pydantic schemas;
- authentication;
- authorization;
- error handling;
- rate limiting.

Avoid business logic directly inside API route handlers when an existing service layer is appropriate.

Use existing dependencies for authenticated users and permissions.

Never bypass permission checks for convenience.

Do not expose database models directly through API responses if the project uses schemas.

---

## Database rules

PostgreSQL/PostGIS is authoritative.

Do not:

- silently change database schemas;
- modify existing Alembic migrations after they have been committed/applied;
- use destructive SQL operations without explicit request;
- drop columns/tables/data automatically;
- modify production data;
- generate migrations unrelated to the requested change.

When a schema change is required:

1. Modify the SQLAlchemy model.
2. Create a new Alembic migration.
3. Review the generated migration manually.
4. Ensure downgrade behavior is reasonable.
5. Check migration ordering and dependencies.

For geospatial data:

- preserve SRID 4326 unless existing code explicitly requires another SRID;
- respect existing PostGIS indexes;
- avoid unnecessary coordinate transformations;
- preserve longitude/latitude ordering used by the existing project.

---

## Security rules

Security-sensitive code must be treated conservatively.

Pay particular attention to:

- authentication;
- authorization;
- sharing permissions;
- account management;
- API credentials;
- encryption;
- password handling;
- MFA;
- session management;
- administrative endpoints;
- user quotas.

Never:

- log passwords, tokens, API keys or decrypted credentials;
- expose secrets to the frontend;
- hard-code secrets;
- commit credentials;
- weaken authorization checks to make tests pass;
- disable TLS verification in application code unless explicitly requested for a controlled development scenario.

User API credentials must remain encrypted at rest.

Decryption should occur only when required and as late as possible.

Do not introduce a global/fallback credential where CartaVault uses credentials scoped per user.

---

## Frontend rules

Follow the existing React architecture and component patterns.

Prefer existing shared components over introducing visually similar duplicates.

Preserve:

- responsive behavior;
- dark mode;
- keyboard accessibility;
- existing localization;
- loading states;
- empty states;
- error states.

Do not hard-code user-visible text if the surrounding feature uses internationalization.

Avoid unnecessary dependencies.

Do not replace an established UI library/component without explicit justification.

---

## CartaVault UI/UX principles

CartaVault uses a consistent modern UI.

General visual principles:

- clean and restrained;
- compact but readable;
- consistent spacing;
- rounded cards/panels;
- low visual noise;
- clear hierarchy;
- predictable button placement;
- consistent icons;
- light and dark themes must both work.

Primary visual palette includes:

- Deep Navy: `#0D1B2A`
- Slate Blue: `#2B3E59`
- Emerald Teal: `#0FA68A`
- Mist: `#F2F5F8`
- Gold: `#C8A14A`

Primary typography is Manrope where already implemented.

Do not introduce arbitrary colors, spacing values or visual styles when existing design tokens/components can be reused.

---

## Map UI principles

The map is the core workspace.

Do not unnecessarily obscure or reduce the map area.

Map-level actions should remain distinct from global application actions.

Current map UI principles include:

- main map toolbox over the map;
- inline map search;
- map legends;
- theme selector;
- country filter;
- detachable/attachable panels;
- resizable panels;
- compact panel controls;
- map-specific actions grouped coherently.

Do not reintroduce actions in multiple locations unless there is a deliberate UX reason.

Avoid placing import/export actions in feature panels when they already belong to map-level actions.

---

## Panels

Major CartaVault panels should share consistent behavior and visuals.

Where relevant, support the existing concepts:

- attached/docked mode;
- detached/free mode;
- collapsed/reduced mode;
- visible resize handles;
- consistent headers;
- consistent search/filter placement.

Existing redesigned panels should be treated as references rather than creating a new style from scratch.

---

## Account and administration UI

Account-related screens should follow the established CartaVault account modal design:

- lateral navigation;
- clear section header;
- summary cards where appropriate;
- consistent spacing;
- consistent account/security presentation.

Security-related settings must prioritize clarity over compactness.

Administrative functionality must never be exposed solely through frontend hiding; backend permission checks remain mandatory.

---

## Places / POIs

Places are core CartaVault entities.

Changes involving POIs must preserve, where applicable:

- UUID identifiers;
- geospatial coordinates;
- country/region metadata;
- categories;
- tags;
- statuses;
- favorites;
- ratings;
- visited state;
- links;
- descriptions;
- access/danger information;
- timestamps.

Do not alter derived status logic without checking the existing implementation and tests.

---

## Trips / outings

Trips/outings may include:

- multiple days;
- ordered steps;
- route calculations;
- durations;
- distances;
- route providers;
- exports.

Preserve ordering and day associations.

Do not silently recalculate or overwrite existing user itinerary data unless explicitly required.

Routing provider errors must fail gracefully.

---

## Mapping providers

CartaVault may use several providers for basemaps, satellite imagery and routing.

Provider-specific code should remain isolated.

Do not make the application depend entirely on a single external provider unless explicitly requested.

Respect existing fallback behavior.

For routing, preserve fallback behavior between configured providers when already implemented.

Do not expose provider API keys client-side unless the provider explicitly requires a public browser token and the existing architecture permits it.

---

## API credentials

CartaVault supports per-user API credentials.

Rules:

- credentials belong to users;
- encrypted storage must be preserved;
- credentials should be decrypted only when required;
- credentials must be removed when the related account is deleted/anonymized where existing logic requires it;
- provider instances containing user secrets should not become long-lived global singletons;
- do not return raw credentials through APIs.

---

## Testing expectations

After modifying backend code, run the relevant backend tests.

After modifying frontend code, run the relevant frontend tests.

For changes affecting both layers, validate both.

Also run relevant static checks/build steps where available.

Do not claim that tests passed unless you actually ran them.

If a test cannot be run, state that explicitly in the final summary.

When a test fails:

1. determine whether the implementation or the test is wrong;
2. do not simply weaken/delete the test;
3. fix the root cause.

---

## Validation before finishing

For a normal change, validate as applicable:

- targeted tests;
- backend test suite;
- frontend test suite;
- frontend lint;
- frontend build;
- Python compile/static checks;
- Alembic consistency/check;
- TypeScript checks.

Use the repository's actual scripts and commands rather than inventing replacements.

---

## Git rules

Unless explicitly requested:

- do not commit;
- do not push;
- do not create branches;
- do not rewrite Git history;
- do not modify unrelated files.

Before finishing, inspect the diff.

Report:

- files changed;
- major implementation decisions;
- tests/checks run;
- failures or limitations;
- migrations created;
- any follow-up concerns.

Never include secrets in Git.

---

## Dependencies

Avoid adding dependencies unless necessary.

Before adding one:

1. verify the feature cannot reasonably be implemented using existing dependencies;
2. explain why the dependency is useful;
3. choose a maintained package;
4. avoid large dependencies for trivial functionality.

Do not perform broad dependency upgrades as part of an unrelated feature.

---

## Error handling

Errors shown to users should be understandable and actionable.

Do not expose:

- stack traces;
- SQL errors;
- internal paths;
- secrets;
- raw provider responses containing sensitive data.

Log enough context for debugging without logging sensitive information.

---

## Performance

Avoid:

- N+1 database queries;
- loading entire large tables when pagination/filtering exists;
- unnecessary React rerenders;
- repeated geospatial calculations;
- repeated external API calls;
- downloading large map resources unnecessarily.

Do not prematurely optimize code unrelated to the requested task.

---

## Scope discipline

A requested UI adjustment should not become an architecture rewrite.

A backend bug fix should not trigger unrelated formatting/refactoring.

A database migration should contain only changes needed for the feature.

If you notice unrelated problems, mention them separately rather than fixing them automatically.

---

## Final response format

At the end of an implementation task, provide a concise summary with:

- what was changed;
- important implementation details;
- tests/checks executed and their results;
- migrations, if any;
- known limitations or remaining issues.

Do not claim completion when required validation is failing.