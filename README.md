# CartaVault

<p align="center">
  <a href="https://github.com/FlynX9/CartaVault/actions/workflows/ci.yml"><img src="https://github.com/FlynX9/CartaVault/actions/workflows/ci.yml/badge.svg" alt="Continuous integration"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  <img src="https://img.shields.io/badge/Python-3.14-blue" alt="Python 3.14">
  <img src="https://img.shields.io/badge/React-TypeScript-61dafb" alt="React and TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-PostGIS-336791" alt="PostgreSQL and PostGIS">
  <img src="https://img.shields.io/badge/status-private%20beta-orange" alt="Status: private beta">
</p>

**CartaVault** is an open-source, self-hosted workspace for collecting points
of interest, organizing private maps and planning multi-day trips while keeping
control of your data.

It combines a FastAPI API, PostgreSQL/PostGIS and a React/TypeScript interface
built around a persistent interactive map. The standard deployment is a single
CartaVault application image plus an official PostGIS container.

> [!IMPORTANT]
> CartaVault is currently a private beta. Features are usable, but deployment
> contracts, migrations and interfaces may still evolve before the first
> stable release. Back up the database and media before every upgrade.

## Product tour

### Maps and places

Browse illustrated POIs, filter large collections, change the map background
and keep the useful information for each place in one record.

<p align="center">
  <img src="docs/screenshots/app-places-en.webp" alt="CartaVault place list displayed next to the map" width="100%">
</p>

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/app-place-popup-en.webp" alt="Illustrated CartaVault place details">
    </td>
    <td width="50%">
      <img src="docs/screenshots/app-media-en.webp" alt="CartaVault media library">
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Detailed and illustrated place records</strong></td>
    <td align="center"><strong>Permission-aware media library</strong></td>
  </tr>
</table>

### Trips and interactive timeline

Build an outing day by day, calculate routes, organize accommodation and
review the whole journey from the interactive timeline.

<p align="center">
  <img src="docs/screenshots/app-trip-en.webp" alt="Multi-day trip planning in CartaVault" width="100%">
</p>

<p align="center">
  <img src="docs/screenshots/app-timeline-en.webp" alt="CartaVault interactive trip timeline with an active step" width="100%">
</p>

### Account and administration

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/app-account-en.webp" alt="CartaVault user profile">
    </td>
    <td width="50%">
      <img src="docs/screenshots/app-admin-en.webp" alt="CartaVault administration console">
    </td>
  </tr>
  <tr>
    <td align="center"><strong>User profile and preferences</strong></td>
    <td align="center"><strong>Administration and access control</strong></td>
  </tr>
</table>

The screenshots use deterministic synthetic demo data and original generated
artwork. They do not reproduce third-party photographs or private user data.

## Highlights

### Maps and places

- private country-based maps with owner, editor and viewer roles;
- POI loading limited to visible bounds, clustering and large-list
  virtualization;
- creation from the map, address search or GPS coordinates;
- descriptions, administrative regions, visit duration, categories, tags,
  statuses, ratings, photos and multiple named links;
- configurable fields per map, favorites, advanced filters and bulk actions;
- KML/KMZ import, duplicate handling and KML/KMZ export;
- unified trash, restoration, retention and detailed audit history.

### Trip planning

- multi-day outings with departure, daily steps, nights and arrival;
- drag-and-drop organization and reusable POIs;
- OSRM routing by default and optional per-user Google Routes credentials;
- distance, driving time, visit time, workload and schedule calculations;
- route-order optimization with an explicit review before applying changes;
- interactive timeline synchronized with routes and map markers;
- configurable PDF export with maps, photos and Google Maps or Waze QR codes.

### Media and presentation

- multiple JPEG, PNG and WebP images per POI;
- clipboard paste, primary-photo selection, ordering and deletion;
- full-size keyboard-accessible gallery;
- centralized permission-aware media library with search and diagnostics;
- responsive light and dark themes with multiple map backgrounds.

### Accounts, sharing and administration

- server-side sessions, CSRF protection and password reset;
- configurable public registration and administrator approval safeguards;
- map invitations and ownership transfer workflows;
- Resend and generic SMTP transactional email providers with retries;
- profile, avatar, session, display, routing and place-search preferences;
- quotas, global credentials and non-sensitive instance diagnostics for
  administrators;
- French and English interfaces and transactional email templates.

## Architecture

```text
Browser
  └── CartaVault application
      ├── compiled React interface
      ├── FastAPI API and OpenAPI
      ├── Alembic migrations
      └── local persistent media storage
          └── PostgreSQL + PostGIS
```

The supported private-beta topology contains exactly two standard services:

| Service | Responsibility |
|---|---|
| `cartavault` | API, compiled frontend, migrations and background maintenance |
| `postgis` | relational and geographic data |

Redis and the RQ worker are an optional extension for independently processed
long tasks. They are not required for a standard mono-instance deployment.

### Repository layout

```text
CartaVault/
├── backend/             # FastAPI, SQLAlchemy, Alembic and pytest
├── demo/                # deterministic demo seed and screenshot automation
├── docker/              # standard, Portainer and optional Redis deployments
├── docs/                # operational and security documentation
├── frontend/            # React, TypeScript, Vite and Leaflet
├── shared/              # shared icon and metadata resources
├── website/             # Astro marketing website
└── README.md
```

## Quick start

### Docker deployment

Docker is the recommended way to run a private-beta instance. Build a versioned
application image and pull the pinned PostGIS companion:

```powershell
.\docker\build.ps1 -Version "0.9.0-beta.1"
```

Copy and review the environment file, then generate persistent secrets:

```powershell
Copy-Item docker\.env.example docker\.env
docker compose --env-file docker/.env -f docker/compose.setup.yml run --rm setup generate-secrets
```

Start the standard two-service stack:

```powershell
docker compose --env-file docker/.env -f docker/compose.yml up -d
docker compose --env-file docker/.env -f docker/compose.yml ps
```

The application waits for PostGIS, applies every Alembic migration and only
becomes healthy after startup has completed. Open the configured public URL to
finish the protected setup wizard.

For NAS installation, offline image export, Portainer, reverse proxies,
upgrades, rollback and the optional Redis worker, use the
[Docker deployment guide](docker/README.md).

### Local development on Windows

Requirements: Git, Docker Desktop, Python 3.14, Node.js and npm.

Start PostgreSQL/PostGIS from the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

Start the backend:

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m alembic upgrade heads
python -m app.cli create-admin
python -m uvicorn app.main:app --reload
```

Start the frontend in a second terminal:

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

The frontend is usually available at <http://localhost:5173>. The local API
documentation is available at <http://127.0.0.1:8000/docs>; the unified Docker
image exposes it below `/api/docs`.

Detailed development notes live in the [backend](backend/README.md) and
[frontend](frontend/README.md) guides.

## Configuration notes

### Routing and place search

OSRM and Stadia are the default providers. Users can opt into Google Routes or
Google Places by configuring their own compatible API key in account
preferences. Provider credentials are encrypted server-side and are never
returned to the browser.

The instance must preserve this key with its database backup whenever personal
provider credentials are stored:

```text
CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY=<fernet-key>
```

Generate a Fernet key with:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Persistent data

Back up PostgreSQL, photos, avatars and the credential-encryption key as one
recovery set. Follow the [backup and restore runbook](docs/backup-and-restore.md)
before an upgrade or migration.

## Deterministic demo and screenshots

The isolated demo environment creates reproducible users, maps, POIs, trips,
routes and lightweight original illustrations. Demo runtime data and generated
captures remain ignored by Git; only the seed, source artwork and selected
documentation screenshots are versioned.

```powershell
docker compose -f demo/compose.yml up -d
docker compose -f demo/compose.yml --profile screenshots run --rm screenshots
```

See the [demo guide](demo/README.md) for reset rules, accounts, scenario
coverage and remote screenshot targets.

## Documentation

The bilingual user and administrator guide is published at
[cartavault.fr/docs/en](https://cartavault.fr/docs/en/). It is built with the
marketing site and includes searchable, generated API, environment, CLI, and
feature references.

- [Docker, Portainer and Synology](docker/README.md)
- [Backup and restore](docs/backup-and-restore.md)
- [Background tasks and Redis](docs/background-tasks.md)
- [Security audit](docs/security-audit-2026-07.md)
- [Dependency security policy](docs/dependency-security.md)
- [Administration audit](docs/administration-audit.md)
- [Instance status](docs/instance-status.md)

## Quality and security

GitHub Actions validates backend and frontend tests, linting, production builds,
Alembic migrations, the standard Docker topology, the optional Redis extension
and dependency/security checks. The backend test job uses an isolated PostGIS
service.

Before publishing or deploying CartaVault:

- never commit `.env` files, passwords, API keys or Docker secrets;
- use distinct secrets for every environment;
- keep immutable image tags for rollback;
- expose CartaVault through HTTPS on untrusted networks;
- restrict provider keys and configure quotas or budget alerts;
- validate a restore regularly, not only the backup archive.

## Project status and contributing

CartaVault is actively developed. Issues and pull requests are welcome on
[GitHub](https://github.com/FlynX9/CartaVault/issues). Please discuss major
changes in an issue before implementation so they remain consistent with the
permission model, deployment contract and interface.

## License

CartaVault is distributed under the [MIT License](LICENSE).

Made in Vosges.
