# CartaVault Docker deployment

CartaVault uses two runtime images and two required services:

- `cartavault:<version>` contains FastAPI, Alembic and the compiled React frontend;
- the digest-pinned `postgis/postgis:16-3.5` Debian image stores PostgreSQL/PostGIS data.

The application container is disposable. Database data, photos, avatars and
generated exports remain in external volumes. The external reverse proxy owns
HTTPS and forwards one HTTP port to CartaVault.

Proxy forwarding headers are disabled by default. When CartaVault is behind a
reverse proxy, set `CARTAVAULT_FORWARDED_ALLOW_IPS` to that proxy's exact IP or
CIDR range. CartaVault rejects `*` so clients cannot forge their source address
through `X-Forwarded-For` and bypass IP-based protections.

## Build and offline export

Build the application image and pull the pinned PostGIS companion image:

```powershell
.\docker\build.ps1 -Version "0.9.0-beta.1"
```

Export both images for an offline NAS or Portainer installation:

```powershell
.\docker\export-images.ps1 -Version "0.9.0-beta.1" -OutputDirectory "D:\docker-exports"
```

The archive contains `cartavault:0.9.0-beta.1` and
`postgis/postgis:16-3.5` at the digest declared in the Compose file.

## First installation

Copy the environment template and generate persistent secrets:

```sh
cp docker/.env.example docker/.env
docker compose --env-file docker/.env -f docker/compose.setup.yml \
  run --rm setup generate-secrets
```

Review `docker/.env`, then start the stack:

```sh
docker compose --env-file docker/.env -f docker/compose.yml up -d
```

The CartaVault entrypoint performs this bounded sequence before opening the
HTTP service:

1. wait for repeated successful PostgreSQL connections;
2. acquire the migration advisory lock;
3. apply every Alembic head;
4. verify the optional legacy administrator bootstrap;
5. replace the startup process with Uvicorn.

A migration error terminates the container. It is never ignored and no
automatic downgrade is attempted.

## HTTP routing

FastAPI serves the complete same-origin application:

```text
/api/*     FastAPI API and OpenAPI documentation
/assets/*  immutable content-hashed Vite assets
/*         React application and deep-link fallback
/healthz   lightweight container readiness endpoint
```

Unknown `/api/*` routes remain JSON 404 responses and are never replaced by
the React shell. `index.html` is not stored with a long-lived cache policy.

## Persistent configuration

Required runtime values include:

- `CARTAVAULT_VERSION` and `DATABASE_URL`;
- PostgreSQL database, user and password;
- public URL and allowed CORS origins;
- session, setup and credential-encryption secrets;
- sender address for transactional email.

No runtime secret or `.env` file is copied into the image. Keep
`CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` with the database and media backups:
encrypted provider credentials cannot be recovered without it.

The standard Compose stack uses named volumes. The Portainer stack uses:

```text
${CARTAVAULT_DATA_ROOT}/postgres
${CARTAVAULT_DATA_ROOT}/photos
${CARTAVAULT_DATA_ROOT}/avatars
${CARTAVAULT_DATA_ROOT}/exports
```

The default Synology root is `/volume2/docker/cartavault`; change it through
`CARTAVAULT_DATA_ROOT`, never by rebuilding the image.

The application runs as the non-root user `cartavault` (UID/GID `999`). Bind
mounts used by Portainer or Synology must grant that identity read/write access
to `photos`, `avatars` and `exports`. The rest of the container filesystem is
read-only, Linux capabilities are dropped, and only a small temporary `/tmp`
filesystem remains writable.

## Portainer and external PostGIS

Use `compose.portainer.yml` for bind-mounted Synology data. Set
`CARTAVAULT_IMAGE` to the locally loaded application image name when it is not
`cartavault`.

Use `compose.external.yml` when PostgreSQL/PostGIS is managed separately. The
application entrypoint still waits for the configured database and applies
migrations before becoming ready.

## Health and logs

`postgis` uses `pg_isready`. `cartavault` becomes healthy only after migrations,
FastAPI lifespan checks and `/healthz` succeed. Startup logs distinguish
configuration, database readiness, migration locking, Alembic, bootstrap and
application phases without printing credentials.

```sh
docker compose --env-file docker/.env -f docker/compose.yml ps
docker compose --env-file docker/.env -f docker/compose.yml logs cartavault
```

## Backup, restore and rollback

Use `backup.sh` and `restore.sh` as described in
[`docs/backup-and-restore.md`](../docs/backup-and-restore.md). Back up the
database, media, deployment configuration and credential-encryption key as one
recovery set before every significant upgrade.

Rolling back only the application image is safe only while its migrations are
backward-compatible. CartaVault never runs `alembic downgrade` automatically;
restore the verified pre-upgrade recovery set when a schema rollback is
required.

## Single-replica beta constraint

The application container runs migrations during startup and therefore assumes
one CartaVault replica for the private beta. The advisory lock prevents an
accidental concurrent migration, but a future multi-replica deployment should
move migrations to a dedicated deployment job or CI-controlled rollout.
