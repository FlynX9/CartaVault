# CartaVault Docker deployment

## Supported standard topology

The beta and mono-instance deployment has exactly two services:

```text
cartavault  one CartaVault-owned image (FastAPI, Alembic, compiled React)
postgis     pinned official PostgreSQL/PostGIS image
```

`docker/compose.yml` and `docker/compose.portainer.yml` are the standard
contracts. They do not require Redis, a worker, a frontend container or a
migration container. Long tasks run synchronously in the single application
process (`CARTAVAULT_TASK_MODE=sync`). This is the supported default for one
public-beta application replica.

The external reverse proxy owns HTTPS and forwards one HTTP port to
CartaVault. PostgreSQL has no published port.

## Public beta image

The official public-beta image is published from a GitHub Release to GitHub
Container Registry:

```text
ghcr.io/flynx9/cartavault:0.9.0-beta.1
```

Use immutable version tags in every deployment. The mutable `beta` tag is only
a discovery alias and must not be the sole rollback reference. The first
public beta supports `linux/amd64`.

```sh
docker pull ghcr.io/flynx9/cartavault:0.9.0-beta.1
docker image inspect ghcr.io/flynx9/cartavault:0.9.0-beta.1
```

Published images include OCI source/version/license metadata, an SBOM and
build-provenance attestations. See
[`../docs/container-releases.md`](../docs/container-releases.md) for the
release, verification and rollback procedure.

## Build and offline export

Build the versioned application image and pull the pinned PostGIS companion:

```powershell
.\docker\build.ps1 -Version "0.9.0-beta.1"
```

Export the two standard images for an offline NAS or Portainer installation:

```powershell
.\docker\export-images.ps1 -Version "0.9.0-beta.1" -OutputDirectory "D:\docker-exports"
```

The archive contains `cartavault:0.9.0-beta.1` and the digest-pinned
`postgis/postgis:16-3.5` image. Use immutable version tags for upgrades and
rollback; do not deploy `latest` as the only rollback reference.

## First installation

Copy the environment template and generate persistent secrets:

```sh
cp docker/.env.example docker/.env
docker compose --env-file docker/.env -f docker/compose.setup.yml \
  run --rm setup generate-secrets
```

Review `docker/.env`, then start only the standard services:

```sh
docker compose --env-file docker/.env -f docker/compose.yml up -d
docker compose --env-file docker/.env -f docker/compose.yml ps
```

The application entrypoint waits for repeated successful PostgreSQL
connections, acquires the migration advisory lock, applies every Alembic head
and starts Uvicorn only after success. A timeout or migration error stops the
container; CartaVault never runs an automatic downgrade.

The single-replica assumption is intentional. A future multi-replica rollout
must move migrations to a dedicated job/CI step or designate one migration
replica.

## HTTP routing and health

FastAPI serves the same-origin application:

```text
/api/*     FastAPI API and OpenAPI documentation
/assets/*  immutable content-hashed Vite assets
/*         React application and deep-link fallback
/healthz   lightweight readiness endpoint
```

Unknown `/api/*` routes remain JSON 404 responses. The React shell is not used
for API failures and `index.html` is not cached as an immutable asset.
`postgis` uses `pg_isready`; `cartavault` becomes healthy only after migrations
and the FastAPI lifespan have completed.

```sh
docker compose --env-file docker/.env -f docker/compose.yml logs postgis cartavault
```

## Configuration, secrets and persistent data

Required runtime values include the versioned image tag, database credentials
and `DATABASE_URL`, public URL/CORS origins, session/setup/encryption secrets,
and the transactional-email sender/provider. Resend uses the encrypted
instance key; generic SMTP uses runtime `EMAIL_SMTP_*` values. No runtime secret or real `.env` file is
copied into the image.

Keep `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` with the database and media backup
set: stored provider credentials cannot be recovered without it.

The standard Compose stack uses these named volumes:

```text
postgres_data  photos_data  avatars_data  exports_data  imports_data
```

The Portainer/Synology stack maps the same data below
`${CARTAVAULT_DATA_ROOT}` (default `/volume2/docker/cartavault`):

```text
postgres/  photos/  avatars/  exports/  imports/
```

The application runs as non-root UID/GID `999`. Bind mounts must grant that
identity read/write access to application storage. The rest of the filesystem
is read-only, capabilities are dropped and only `/tmp` is a writable tmpfs.
Do not hard-code NAS paths into the image.

Proxy headers are disabled by default. Behind a reverse proxy, set
`CARTAVAULT_FORWARDED_ALLOW_IPS` to its exact IP/CIDR. The wildcard `*` is
rejected.

## Portainer, Synology and external PostGIS

- `compose.portainer.yml`: standard two-service stack with bind mounts;
- `compose.external.yml`: one CartaVault service when PostGIS is managed
  outside this Compose project;
- `compose.setup.yml`: one-shot secret-generation tool, never a runtime
  service.

Set `CARTAVAULT_IMAGE` in Portainer when the loaded image is not named
`ghcr.io/flynx9/cartavault`. The supplied environment example already uses the
public GHCR image. Keep the existing external reverse-proxy destination port;
only the container behind it changes.

## Optional Redis/worker extension

Redis and RQ remain supported, but they are not part of the standard stack.
Opt in only when task isolation or independent worker scaling is required:

```sh
docker compose --env-file docker/.env \
  -f docker/compose.yml -f docker/compose.redis.yml up -d
```

For Portainer/Synology, combine `compose.portainer.yml` with
`compose.portainer.redis.yml`. Define `REDIS_PASSWORD` and optionally
`CARTAVAULT_TASK_QUEUE` before deploying. The extension switches only the
application/worker to `CARTAVAULT_TASK_MODE=redis`, adds a private authenticated
Redis service and reuses the same CartaVault image for the worker.

The standard offline export intentionally contains no Redis image. Pull/export
the pinned Redis image separately when this optional topology is selected.
See [`docs/background-tasks.md`](../docs/background-tasks.md).

## Upgrade from the previous beta stack

The change is non-destructive: existing database and media data are reused.

1. Back up PostgreSQL, photos, avatars, deployment configuration and
   `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` as one recovery set.
2. Record the old immutable image tags and stop the former frontend/backend/
   migrate/Redis/worker stack without deleting volumes or bind-mounted data.
3. Map the existing PostgreSQL data to `postgis` and existing media paths to
   the corresponding `cartavault` mounts.
4. Preserve `DATABASE_URL`, public URL, CORS, mail and authentication secrets;
   remove Redis variables unless the optional extension is intentionally used.
5. Deploy `compose.yml` or `compose.portainer.yml`. The unified container waits
   for PostGIS and runs `alembic upgrade head` before becoming healthy.
6. Validate `/healthz`, login, a map, a media file and one safe write.

Do not delete the old volumes until the new stack and a restore test are
accepted. Rolling an application image back is safe only while the migrated
schema is backward-compatible; otherwise restore the complete pre-upgrade
recovery set. See [`docs/backup-and-restore.md`](../docs/backup-and-restore.md).

## Verification contract

CI validates that the standard Compose resolves to exactly `postgis` and
`cartavault`, builds the unified image from a clean checkout, starts an empty
database, applies migrations, verifies frontend/API routing and health, checks
the non-root/read-only runtime, recreates the application container and proves
media persistence. It also validates the optional four-service Compose merge
without making it the standard deployment.
