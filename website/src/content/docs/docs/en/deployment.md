---
title: Deployment and operations
description: Install, update, back up, and monitor a CartaVault instance.
sidebar:
  order: 12
---

## Standard architecture

The recommended single-instance beta stack contains:

- the unified `ghcr.io/flynx9/cartavault` image for UI, API, and migrations;
- PostgreSQL/PostGIS for geographic data;
- persistent volumes for photos, avatars, imports, and exports.

Redis and a worker are optional extensions for imports and long-running tasks. Standard mode works without them.

## Prepare configuration

Copy the Docker Compose or Portainer environment template. At minimum, configure the database, public URL, CORS origins, sender address, and CartaVault secrets.

Generate secrets with:

```bash
python -m app.setup_cli generate-secrets
```

Keep `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` permanently. Losing it makes stored Google and Resend credentials unreadable.

## First start

1. Start PostGIS and wait until healthy.
2. Start CartaVault; the container entrypoint applies Alembic migrations under a lock.
3. Open the public URL.
4. Enter the setup token when requested.
5. Create the first administrator.

The setup wizard locks after the first administrator is created.

## Update

1. Create a consistent backup.
2. Set `CARTAVAULT_VERSION` to an immutable tag such as `1.0.0-rc.1`.
3. Pull the image and recreate the service.
4. Watch migrations and `/healthz`.
5. Verify sign-in, one map, one photo, and a representative calculation.

Avoid the floating `beta` tag when reproducibility matters. Do not run an older application against a newer schema without a compatible restore procedure.

## Backup

A complete backup combines PostgreSQL, photos, avatars, configuration, and the encryption key. Run `docker/backup.sh`, verify `SHA256SUMS`, and copy the result away from the host.

Regularly restore into an isolated project. A backup that has never been restored is not a proven recovery path.

## Redis and worker

Enable the Redis Compose extension when long tasks should not occupy the web process. Redis keeps the queue and the worker executes tasks. Use a Redis password, persistent storage, and the same image version for the application and worker.

## Email

CartaVault supports Resend and generic SMTP. Configure sender identity, transport, and secrets. `EMAIL_PROVIDER=none` explicitly disables delivery without rolling back business operations.

## Health and diagnostics

The administration panel exposes CartaVault version, Alembic revision, PostGIS availability, storage, routing, and email state without returning secrets. Orchestrators use `/healthz`.

See the [environment reference](/docs/en/reference/environment/), [administration commands](/docs/en/reference/cli/), and [troubleshooting guide](/docs/en/troubleshooting/).
