# CartaVault — AGENTS.md

## Project overview

CartaVault is a self-hosted/open-source geospatial application built with:

- FastAPI
- SQLAlchemy 2
- PostgreSQL + PostGIS
- GeoAlchemy2
- Alembic
- React 19
- TypeScript strict
- Vite
- Leaflet / MapLibre / PMTiles where applicable
- Docker / Docker Compose

Backend code lives in `backend/`.
Frontend code lives in `frontend/`.

For significant backend work, read `backend/README.md` before changing behavior.
For significant frontend work, read `frontend/README.md` before changing behavior.

Reuse existing patterns and shared components before creating new abstractions.
User-visible frontend text must use the existing `t()` i18n system.
Prefer existing `--cv-*` design tokens and `cv-` classes.

---

## General behavior

Before modifying code:

1. Inspect the relevant implementation.
2. Identify existing patterns and reusable components.
3. Determine the smallest safe change.
4. Preserve backward compatibility unless explicitly told otherwise.
5. Find the root cause before fixing bugs.

Do not:

- perform broad refactors unless explicitly requested;
- rewrite working modules only because another implementation looks cleaner;
- modify unrelated files;
- make speculative fixes;
- turn localized UI work into architecture rewrites.

When intent is ambiguous, infer it from existing CartaVault code and established UI patterns.
Report unrelated problems separately instead of fixing them automatically.

---

## Repository exploration

Use targeted exploration.

For non-trivial work, inspect only the layers relevant to the task, such as:

- frontend components;
- API endpoints;
- schemas and shared types;
- services;
- SQLAlchemy models;
- migrations;
- tests;
- localization keys;
- authentication and permission checks.

Do not read the entire repository when targeted exploration is sufficient.

## Subagent delegation

Use subagents only when they materially improve the task.

### Exploration

Use `explore-fast` when the affected implementation is not yet known or when
quick repository exploration can significantly reduce the working context.

Do not use it for trivial changes when the relevant file is already known.

### Implementation

Use `frontend` for implementation involving primarily:

- React;
- TypeScript;
- CSS;
- frontend state;
- frontend interactions;
- frontend tests.

Use `backend` for implementation involving primarily:

- FastAPI;
- SQLAlchemy;
- Pydantic;
- PostgreSQL/PostGIS;
- Alembic;
- backend services;
- backend tests.

For cross-layer problems, determine the root cause first and use both when
necessary.

The primary agent remains responsible for integration, final edits and final
validation.

### Review

Use `ui-review` for meaningful UI/UX changes.

Use `review` after non-trivial implementations or when regression risk is
significant.

Use `architecture-review` only for non-trivial cross-cutting architectural
changes.

Use `security-review` only when changes affect security-sensitive areas such as:

- authentication;
- authorization;
- sharing;
- sessions;
- MFA;
- credentials;
- encryption;
- administration;
- quotas;
- privilege boundaries.

Do not invoke expensive or specialized reviewers mechanically.

### General rule

Do not invoke subagents merely because they exist.

Small localized changes should normally be handled directly by the primary
agent.

---

## Backend

Follow existing FastAPI, SQLAlchemy and Pydantic patterns.

- Keep route handlers thin when a service layer exists.
- Keep business logic in services where appropriate.
- Reuse existing authentication and authorization dependencies.
- Never bypass or weaken permission checks.
- Return Pydantic schemas rather than raw ORM models.
- Preserve existing API semantics and error behavior.
- Avoid unnecessary dependencies.

---

## Database and migrations

PostgreSQL/PostGIS and Alembic are authoritative.

Never:

- silently change the schema;
- modify an already-applied migration;
- drop tables, columns or user data without explicit request;
- modify production data;
- create unrelated migrations.

For schema changes:

1. Update the SQLAlchemy model.
2. Create a new Alembic migration.
3. Review the migration.
4. Verify ordering and dependencies.
5. Keep downgrade behavior reasonable.
6. Run relevant Alembic checks.

For geospatial data:

- preserve SRID 4326 unless existing code requires otherwise;
- preserve established longitude/latitude ordering;
- preserve spatial indexes;
- avoid unnecessary coordinate transformations.

---

## Security

Treat security-sensitive code conservatively.

Pay particular attention to:

- authentication and authorization;
- sharing permissions;
- account/session management;
- MFA;
- admin endpoints;
- quotas;
- API credentials and encryption.

Never:

- log passwords, API keys, tokens or decrypted credentials;
- expose secrets to the frontend;
- hard-code or commit credentials;
- weaken authorization to make tests pass;
- return raw credentials through APIs.

Per-user API credentials must remain encrypted at rest.
Decrypt them only when required and as late as possible.
Do not introduce global fallback credentials where CartaVault uses per-user credentials.
Backend authorization must never rely only on frontend hiding.

---

## Frontend and UI

Follow the existing React and TypeScript architecture.

Preserve where applicable:

- responsive behavior;
- light/dark themes;
- keyboard accessibility;
- localization;
- loading states;
- empty states;
- error states.

Prefer existing components, tokens and interaction patterns.
Do not hard-code user-visible text.
Avoid duplicated state, unnecessary rerenders and unnecessary dependencies.

CartaVault uses a restrained and consistent visual language:

- compact but readable layouts;
- clear hierarchy;
- consistent spacing;
- predictable actions;
- consistent icons;
- low visual noise.

Do not introduce arbitrary colors or a new visual language for localized changes.
Preserve the validated surrounding design unless a broader redesign is explicitly requested.

---

## Map and panels

The map is the core workspace.
Do not unnecessarily reduce or obscure the usable map area.

Keep map-level actions distinct from global application actions.

Preserve established behavior where relevant:

- map toolbox;
- search;
- legends;
- basemap/theme selector;
- country filter;
- map-specific actions;
- docked/attached panels;
- detached/free panels;
- collapsed/reduced panels;
- resizing;
- consistent headers;
- consistent search/filter placement.

Do not duplicate actions in several UI locations without a deliberate UX reason.
Treat already redesigned panels as visual and behavioral references.

---

## Core business rules

Places/POIs and trips are core entities.
Do not change established business rules without checking implementation and tests.

For POIs, preserve relevant identifiers, coordinates, metadata, classifications, statuses and user data.

For trips, preserve:

- day associations;
- step ordering;
- distances and durations;
- route data;
- existing itinerary data.

Do not silently recalculate or overwrite user itinerary data.

Keep mapping/routing provider-specific code isolated.
Preserve existing provider fallback behavior.
Do not unnecessarily depend on a single external provider.
Never expose provider API keys client-side unless the existing architecture explicitly permits a public browser token.

---

## Testing and validation

Use repository scripts and run relevant checks.
Use targeted checks first, then broader checks when appropriate.

After backend changes, run relevant backend checks/tests.
After frontend changes, run relevant frontend checks/tests.
For cross-layer changes, validate both.

Do not claim a test or check passed unless it actually ran.
If a check cannot be run, say so explicitly.

When a test fails:

1. determine whether code or test is wrong;
2. do not weaken or delete the test merely to make it pass;
3. fix the root cause when it belongs to the requested scope.

Do not claim completion while required validation is failing.

---

## Git

Unless explicitly requested:

- do not commit;
- do not push;
- do not create branches;
- do not rewrite Git history;
- do not modify unrelated files.

Before finishing:

- inspect the diff;
- verify the scope;
- verify no secret was introduced.

When commits are explicitly requested, use concise English imperative conventional commits.

---

## Dependencies, errors and performance

Avoid adding dependencies unless necessary.
Do not perform unrelated dependency upgrades.

Before adding a dependency:

1. verify existing dependencies cannot reasonably solve the need;
2. justify why it is useful;
3. prefer a maintained package;
4. avoid large dependencies for trivial functionality.

User-facing errors must be understandable and actionable.

Do not expose stack traces, SQL errors, internal paths, secrets or sensitive raw provider responses.

Avoid introducing:

- N+1 queries;
- unnecessary full-table loads;
- unnecessary React rerenders;
- repeated geospatial calculations;
- repeated external API calls;
- unnecessary large map downloads.

Do not prematurely optimize unrelated code.

---

## Scope discipline

Make the smallest safe change that satisfies the request.

A localized UI adjustment is not an architecture rewrite.
A backend bug fix is not permission for unrelated cleanup.
A migration must contain only what the requested feature needs.

If an issue is outside scope, mention it separately rather than fixing it automatically.

---

## Final response

At the end of an implementation task, provide a concise summary with:

- what changed;
- important implementation decisions;
- files changed;
- tests/checks executed and results;
- migrations created, if any;
- failures, limitations or remaining concerns.

Do not claim completion while required validation is failing.
