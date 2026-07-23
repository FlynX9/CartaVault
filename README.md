# CartaVault

La console d’administration comprend une page **État de l’instance** réservée aux administrateurs. Elle agrège des diagnostics non sensibles sur les services, l’usage, la sécurité et la maintenance. Voir [la documentation Instance Status](docs/instance-status.md).

**English** | [Français](README.fr.md)

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  <img src="https://img.shields.io/badge/Python-3.14-blue" alt="Python 3.14">
  <img src="https://img.shields.io/badge/React-TypeScript-61dafb" alt="React and TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-PostGIS-336791" alt="PostgreSQL and PostGIS">
  <img src="https://img.shields.io/badge/status-active%20development-orange" alt="Status: active development">
</p>

**CartaVault** is an open-source, self-hosted mapping application designed to centralize points of interest, organize private maps, and plan structured outings while keeping full control of your data.

It combines a **FastAPI** backend, a **PostgreSQL/PostGIS** database, and a **React TypeScript** interface built around a persistent Leaflet map.

> [!IMPORTANT]
> CartaVault is under active development. The application can already be used locally, but deployment and migration procedures, as well as some interfaces, may still change before the first stable release.

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture and technical stack](#architecture-and-technical-stack)
- [Quick start on Windows](#quick-start-on-windows)
- [Google Routes configuration](#google-routes-configuration)
- [Security](#security)
- [Project status](#project-status)
- [Contributing](#contributing)
- [License](#license)

## Overview

### Place management

<p align="center">
  <img src="docs/screenshots/gestion-lieux.webp" alt="Place management in CartaVault" width="100%">
</p>

### Outing planning

<p align="center">
  <img src="docs/screenshots/gestion-sorties.webp" alt="Outing planning in CartaVault" width="100%">
</p>

### Organization and customization

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/gestion-categories.webp" alt="CartaVault category management">
    </td>
    <td width="50%">
      <img src="docs/screenshots/gestion-status.webp" alt="CartaVault status management">
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Categories and icons</strong></td>
    <td align="center"><strong>Tracking statuses</strong></td>
  </tr>
</table>

### User account

<p align="center">
  <img src="docs/screenshots/profil-utilisateur.webp" alt="CartaVault user account and profile area" width="760">
</p>

## Features

### Maps and places

- private maps associated with a country;
- POI display with loading restricted to the visible map bounds;
- local clustering of standard markers;
- place creation from the map, geographic search, or GPS coordinates;
- detailed place records with descriptions, coordinates, categories, tags, status, photos, and links;
- optional fields configurable per map;
- favorites, pre-visit and post-visit ratings, sorting, and advanced filters;
- bulk actions, trash, restore, and audit history;
- direct Google Maps links when coordinates are available.

### Categories, icons, tags, and statuses

- full management of categories, tags, and statuses;
- a closed local catalog of **300 icons**, shared between the frontend and backend;
- no user-provided URLs, arbitrary SVG files, or network calls for icons;
- the primary category determines the marker icon;
- the status determines its color;
- compact legend for active statuses;
- clear separation between tracking status and the physical condition of a place.

### Photos

- multiple JPEG, PNG, and WebP uploads;
- main photo selection;
- reordering and deletion;
- secure local storage, separate from user avatar storage.

### Import and export

- two-step KML/KMZ import with preview and confirmation;
- support for `Point` `Placemark` elements, `ExtendedData`, and embedded images;
- validation of archives, paths, sizes, links, and duplicates;
- preservation of unmapped fields in custom fields;
- outing export to Google Maps, GPX, and KMZ.

### Outing planning

- outings split across multiple days;
- steps linked to a POI or added freely;
- drag-and-drop addition and reordering;
- accommodation between two days;
- separate calculations for distance, driving time, visits, buffers, and safety margin;
- recommended departure time or estimated arrival time;
- customizable daily workload thresholds;
- optional route-order optimization, always subject to user validation;
- one route color per day;
- warnings for outdated or partial routes.

### Routing

CartaVault uses **OSRM** by default and can use the **Google Routes API** as an alternative routing engine.

- routing engine selected in account preferences;
- one Google API key per user;
- server-side encryption using a Fernet master key;
- user API keys are never returned to the browser;
- quotas and errors are isolated per user;
- automatic fallback to OSRM after Google credentials are removed;
- a “Stay within the country” option with validation of the calculated geometry.

### Multi-user support and permissions

- authentication with server-side sessions;
- private maps by default;
- one owner per map;
- members with `viewer` or `editor` roles;
- global administrators;
- permissions applied consistently to maps, places, and outings;
- an Account area for profile details, avatar, security, sessions, preferences, and account deletion or anonymization.

> [!NOTE]
> Public registration requires administrator approval. Registration and password-reset emails use the Resend key configured in Administration; public maps and automatic map-invitation emails are not currently available.

### Map layers

The map layer can be changed without reloading the map:

- CartaVault Light;
- CartaVault Dark;
- Satellite;
- OpenStreetMap Standard.

CartaVault Light and Dark are locally hosted MapLibre styles backed by OpenFreeMap vector tiles and rendered inside the existing Leaflet map. They require no account or API key. The satellite source remains independently configurable and OpenStreetMap Standard remains the controlled raster fallback. Individual providers can be hidden with `VITE_BASEMAP_LIGHT_ENABLED`, `VITE_BASEMAP_DARK_ENABLED`, `VITE_BASEMAP_SATELLITE_ENABLED`, and `VITE_BASEMAP_OSM_ENABLED`. See `frontend/README.md` for provider URLs, attribution, public-instance limitations, and the self-hosted OpenFreeMap or PMTiles migration path.

## Architecture and technical stack

### Repository structure

```text
CartaVault/
├── backend/
│   ├── app/                 # feature-oriented FastAPI API
│   ├── migrations/          # Alembic migrations
│   ├── storage/             # local file storage
│   └── tests/               # backend tests
├── database/
│   └── init/                # PostgreSQL/PostGIS initialization
├── docs/
│   └── screenshots/         # project screenshots
├── frontend/                # Vite, React, TypeScript, and Leaflet
├── shared/                  # shared frontend/backend resources
├── docker-compose.yml
├── LICENSE
├── README.fr.md
└── README.md
```

Detailed backend documentation is available in [`backend/README.md`](backend/README.md).

### Stack

| Area | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Leaflet |
| Backend | FastAPI, SQLAlchemy, GeoAlchemy2 |
| Database | PostgreSQL, PostGIS |
| Migrations | Alembic |
| Tests | pytest and automated frontend tests |
| Local deployment | Docker Compose |

## Quick start on Windows

### Requirements

- Git;
- Docker Desktop with Docker Compose;
- Python 3.14;
- Node.js and npm.

### 1. Database

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
```

The Docker initialization script sets up PostgreSQL/PostGIS and the CartaVault schema only when a new volume is created. Make sure the container is running before continuing:

```powershell
docker compose ps
```

### 2. Backend and first administrator

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Then configure the required variables in `backend/.env`, especially `DATABASE_URL`. Never commit this file.

For a new installation, first apply migrations up to the revision that allows creation of the initial administrator:

```powershell
python -m alembic upgrade d8f4a2c7e910
python -m app.cli create-admin
python -m alembic upgrade head
```

The `create-admin` command is interactive and hides the password. It creates the first active administrator required by later migrations.

Then start the API:

```powershell
python -m uvicorn app.main:app --reload
```

Swagger is available at <http://127.0.0.1:8000/docs>.

> [!WARNING]
> The first Alembic revision is an empty baseline derived from a pre-existing schema. By itself, it does not create tables in an empty database. The initial schema is provided by `database/init/001_initial_schema.sql` when a new Docker volume is created. For an existing database or volume, read the detailed migration procedure in [`backend/README.md`](backend/README.md) before running the commands above.

### 3. Frontend

In a second terminal, from the repository root:

```powershell
Set-Location frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

`npm ci` uses `package-lock.json` to install the exact dependency versions validated by the project. For local development, leave `VITE_API_BASE_URL` empty to use the Vite proxy to the API at `127.0.0.1:8000`.

Vite displays the local address, usually <http://localhost:5173>.

## Google Routes configuration

Each user can store their own Google Routes key from the Account area. The instance must also define a master encryption key:

```text
CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY=<fernet-key>
```

Generate one with:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

This key is not required to start CartaVault with OSRM. It becomes mandatory when storing or using personal Google Routes credentials.

Store this value in a deployment secret or an untracked `.env` file. Losing it makes previously stored Google keys impossible to decrypt.

Restrict the Google key to the Routes API and, whenever possible, to the server IP addresses. Also configure quotas and budget alerts in Google Cloud.

## Security

Before publishing or deploying the project:

- never commit `.env` files;
- never store API keys, passwords, or Docker secrets in Git;
- back up the database before running migrations;
- use separate encryption keys and secrets for each environment;
- configure restrictions for Stadia Maps and Google Routes keys;
- review the Git history before making a repository public.

## Project status

### Custom statuses and visit filters

Statuses are scoped to each map and remain fully customizable. Every status is
classified as either `non_visited` or `visited`; this functional state, rather
than a status or category name, drives visit filters, counters, ratings and map
results. New maps receive four editable defaults: À faire, À vérifier, Visité
and À refaire. The main Places filters stay stable (All, Not visited, Visited,
Favorites), while advanced filters expose the real statuses of the active map.

### Already available

- maps and places;
- categories, tags, statuses, and 300 local icons;
- photos;
- KML/KMZ import;
- users, roles, and permissions;
- outing planning and optimization;
- OSRM and Google Routes routing;
- advanced filters and bulk actions;
- place trash and history;
- Account area and user preferences.
- reusable per-user quota profiles with administrator assignment and backend enforcement;

### Before a stable release

The main remaining work includes:

- finalizing production deployment;
- continuously improving the interface and accessibility;
- strengthening installation and migration documentation;
- optional object storage for distributed deployments;
- registration and invitation flows suitable for a potential SaaS offering.

Detailed progress is tracked in the [GitHub issues](../../issues).

## Contributing

Contributions, bug reports, and improvement proposals are welcome through GitHub issues and pull requests.

Before starting a significant contribution, please open an issue to discuss the need and how it should fit into the project architecture.

## License

CartaVault is distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

Made in Vosges
# Administration

La console centrale CartaVault est disponible sur `/admin` uniquement pour les administrateurs. Elle regroupe la gestion paginée des utilisateurs, les credentials globaux sûrs, les quotas et le diagnostic de l’instance. Les clés personnelles restent dans le compte utilisateur et les secrets d’infrastructure ne sont jamais exposés. Voir [l’audit des paramètres](docs/administration-audit.md).
# Media library

CartaVault includes a centralized **Media** workspace for every authenticated
user. It only lists photos attached to maps the user owns or belongs to; global
administration does not grant access to private map media. The library provides
server-side pagination, search, map/format/primary/diagnostic filters, safe
downloads, lazy WebP thumbnails, metadata editing, primary-photo selection,
and permission-checked single or bulk deletion.

The original local storage remains private. API responses never expose an
absolute or relative storage path. Generated thumbnails are stored below the
configured photo storage root and can be recreated at any time.
