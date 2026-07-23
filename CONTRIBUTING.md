# Contributing to CartaVault

Thank you for your interest in CartaVault.

CartaVault is an open-source application for private maps, places, and trip planning. Contributions may concern the frontend, backend, documentation, tests, deployment, or user experience.

Before starting, review existing issues to avoid duplicate work and to confirm whether a related discussion is already in progress.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Report an issue](#report-an-issue)
- [Propose a feature](#propose-a-feature)
- [Prepare the local environment](#prepare-the-local-environment)
- [Project architecture](#project-architecture)
- [Create a branch](#create-a-branch)
- [Code conventions](#code-conventions)
- [Run verification](#run-verification)
- [Create an Alembic migration](#create-an-alembic-migration)
- [Security and sensitive data](#security-and-sensitive-data)
- [Commits and pull requests](#commits-and-pull-requests)

## Code of conduct

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, constructive, and mindful of security and privacy.

## Report an issue

Use a GitHub issue for reproducible bugs. Include the version or commit, environment, clear reproduction steps, expected and actual behavior, relevant logs without secrets, and screenshots for UI defects.

Do not disclose security vulnerabilities in public issues; follow [SECURITY.md](SECURITY.md) instead.

## Propose a feature

Open an issue before implementing a substantial feature. Explain the user need, expected behavior, permission and data implications, migration needs, and how the work fits the CartaVault architecture.

## Prepare the local environment

### Prerequisites

- Git;
- Docker Desktop with Docker Compose;
- Python 3.14;
- Node.js and npm.

### Clone the repository

```powershell
git clone https://github.com/FlynX9/CartaVault.git
Set-Location CartaVault
```

### Environment variables

Copy the provided `.env.example` files and configure only local, untracked `.env` files. Never commit database URLs, API keys, passwords, encryption keys, or generated storage files.

### Start PostgreSQL/PostGIS

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
docker compose ps
```

### Backend

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

For a new installation that needs the first administrator, follow the bootstrap sequence documented in [backend/README.md](backend/README.md).

### Frontend

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

## Project architecture

### Backend

The FastAPI backend is organized by feature under `backend/app/`. It uses synchronous SQLAlchemy 2, PostgreSQL/PostGIS, Pydantic 2, and Alembic. Routers, schemas, models, service logic, and tests should remain scoped to their feature whenever possible.

### Frontend

The Vite + React + TypeScript frontend lives under `frontend/src/`. Reuse the typed API modules, shared type definitions, existing layout primitives, i18n messages, and CartaVault design tokens. The Leaflet map remains persistent while workspace panels change.

### Database

PostgreSQL/PostGIS is initialized for fresh Docker volumes by `database/init/001_initial_schema.sql`; later schema evolution uses Alembic. Never modify a production or development database merely to validate a change. Database tests must use `TEST_DATABASE_URL` targeting `cartavault_test`.

## Create a branch

Use a focused branch name:

```bash
git checkout master
git pull --ff-only
git checkout -b feat/short-description
```

Use `fix/`, `docs/`, `refactor/`, or `chore/` when more appropriate.

## Code conventions

### General principles

- Preserve existing local changes that are unrelated to your task.
- Prefer small, focused changes and keep public API behavior stable.
- Do not hide errors or weaken valid tests merely to obtain a green result.
- Keep user-facing copy, documentation, comments, commits, and pull requests in English.

### Python

- Use Python 3.14-compatible type annotations.
- Follow the existing synchronous FastAPI and SQLAlchemy 2 patterns.
- Use explicit transactions and roll back before returning transaction errors.
- Enforce authorization server-side; the frontend is not a security boundary.

### React and TypeScript

- Do not introduce `any`.
- Keep API serialization and validation centralized.
- Preserve accessibility: labels, focus order, keyboard operation, and visible focus states.
- Prefer existing components and CSS variables over ad hoc UI patterns.

### CSS and interface

- Follow the CartaVault light and dark themes.
- Use the central design tokens; do not scatter palette values.
- Make responsive layouts work at mobile, tablet, desktop, and browser zoom.
- Do not use browser `alert`, `confirm`, or `prompt` for application workflows.

## Run verification

### Backend

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

Run destructive or migration tests only after validating that `TEST_DATABASE_URL` targets `cartavault_test`.

### Frontend

From `frontend`:

```powershell
npm run verify:category-icons
npm run lint
npm run test
npm run build
```

### Documentation

Update the affected README files, test documentation, configuration notes, and changelog. Markdown must remain in English.

## Create an Alembic migration

Create a migration only for a demonstrated schema change. Review the generated revision, provide a correct upgrade and downgrade where possible, and test it exclusively on `cartavault_test` before production use. Do not rewrite historical migrations.

## Security and sensitive data

### Never commit

- `.env` files;
- database connection strings;
- passwords, tokens, API keys, or encryption material;
- production exports, uploads, or personal data;
- caches, generated files, and local storage artifacts.

### Credentials and secrets

Secrets must be supplied through deployment configuration. API responses and logs must never expose them. Test credentials must be explicitly fake.

### Input validation

Validate inputs at the backend boundary. Treat uploaded files, archive paths, URLs, map data, and external integrations as untrusted.

### Vulnerabilities

Use the private reporting process in [SECURITY.md](SECURITY.md).

## Commits and pull requests

Write concise English Conventional Commit-style messages, for example:

```text
fix(places): preserve selection after bulk updates
```

Keep each commit focused. Pull requests must describe the change, its scope, migrations, tests performed, manual checks, and any limitations. Use the [pull request template](.github/pull_request_template.md), keep discussion in English, and avoid mixing unrelated cleanup with feature work.

## Important changes

Discuss changes affecting permissions, authentication, encryption, routes, data ownership, schema, import/export compatibility, or public APIs before implementation. Document upgrade, rollback, and security implications clearly.

## License

By contributing, you agree that your contribution is distributed under the repository's [MIT License](LICENSE).
