# CartaVault v1 Docker deployment

This directory contains the supported v1 deployment lifecycle. Alembic is the
single source of truth for the application schema. PostgreSQL initialization
creates only the required `postgis` and `pgcrypto` extensions.

## Image contract

Build and deploy PostgreSQL, backend/migration, and frontend images with the
same immutable version:

```powershell
.\docker\build.ps1 -Version "1.0.0"
.\docker\export-images.ps1 -Version "1.0.0" -OutputDirectory "D:\docker-exports"
```

The migration job deliberately reuses the backend image with the same tag.
There is no separate image whose code could drift from the application.

## Required configuration

At minimum configure:

- `CARTAVAULT_VERSION`, with an immutable value such as `1.0.0`;
- `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`;
- `DATABASE_URL`, using the Compose host `postgres`;
- `FRONTEND_PUBLIC_URL` and `CORS_ALLOWED_ORIGINS`;
- `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`;
- `EMAIL_FROM_ADDRESS`;
- the three `CARTAVAULT_BOOTSTRAP_ADMIN_*` values for the first deployment.

Copy `docker/.env.example` to `docker/.env`, replace every placeholder, and
URL-encode reserved characters in the password embedded in `DATABASE_URL`.
Never commit the resulting `.env` file.

The first administrator variables are required only while the database has no
active administrator. Remove them from Portainer after the first successful
deployment. Re-running the job is safe and never prints the password.

For Portainer, use `compose.portainer.yml`. `CARTAVAULT_DATA_ROOT` defaults to
`/volume2/docker/cartavault`, and can be changed to another absolute Synology
path. For a registry, set `CARTAVAULT_IMAGE_PREFIX`, for example
`ghcr.io/flynx9/cartavault`.

## Clean installation

The documented deployment command is:

```sh
docker compose -f docker/compose.yml up -d
```

Compose waits for the final PostgreSQL server, runs the one-shot migration job,
bootstraps the administrator, and starts the backend only after that job exits
successfully. For a legacy pre-authentication database, the job first upgrades
to the authentication schema, bootstraps the owner, then completes every
Alembic head. The job requires multiple stable SQL checks, acquires a
PostgreSQL advisory lock, and reports each phase separately.

In Portainer, deploying the stack performs the same sequence. A failed
`migrate` container intentionally leaves `backend` and `frontend` stopped.
Inspect its logs before retrying.

## Upgrade

1. Build or pull one complete image set with a new immutable version.
2. Create and verify a backup before changing the stack.
3. Change only `CARTAVAULT_VERSION`.
4. Redeploy the stack.
5. Confirm that `migrate` exited with code 0, then verify backend/frontend
   health.

Never run two hand-written Alembic commands during rollout. Concurrent stack
deployments serialize on the advisory lock.

## Backup

Standard Compose:

```sh
./docker/backup.sh /srv/backups/cartavault
```

Portainer/Synology:

```sh
CARTAVAULT_COMPOSE_FILE=/path/to/compose.portainer.yml \
  CARTAVAULT_COMPOSE_PROJECT=cartavault \
  ./docker/backup.sh /volume2/backups/cartavault
```

The timestamped directory contains a custom-format PostgreSQL dump, photo and
avatar archives, checksums, and a version manifest. Copy the encryption key and
other deployment secrets separately to a protected secret store; they are
intentionally never written into the backup.

## Restore test and disaster recovery

Test restores on an isolated stack and isolated ports before every release:

```sh
CARTAVAULT_COMPOSE_PROJECT=cartavault-restore-test \
CARTAVAULT_RESTORE_CONFIRM=restore \
  ./docker/restore.sh /srv/backups/cartavault/20260729T120000Z
```

The restore script verifies checksums, stops application services, restores the
database and media, runs the version-matched migration job, then restarts the
application. Never point a restore test at the production stack.

## Rollback policy

Do not use `alembic downgrade` as an application rollback mechanism.
CartaVault migrations follow **expand / deploy / contract**:

1. **expand** adds backwards-compatible structures;
2. **deploy** moves application reads and writes to them;
3. **contract**, in a later release, removes obsolete structures.

While the deployed migrations remain compatible, roll back by restoring the
previous `CARTAVAULT_VERSION` image set. If a contract migration has run, use
the verified pre-upgrade database and media backup instead.

## Scope

Redis, workers, S3, automated scheduling of backups, multi-architecture builds,
and CI image publication remain outside this deployment.
