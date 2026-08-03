# Background tasks and Redis

CartaVault uses RQ with Redis for explicit long-running operations. PostgreSQL
is the authoritative store for every task and generated artifact. Redis is a
private, disposable transport: queue payloads contain only the task UUID.

## Why RQ

The backend is synchronous FastAPI/SQLAlchemy code. RQ therefore provides the
smallest operational surface while reusing the exact application image and
task functions. Celery offers more routing and scheduling features than the V1
needs, but adds a larger configuration and monitoring footprint. Dramatiq has
strong retry middleware but would still require CartaVault's persistent state
model. Arq is naturally async and would force adapters around the existing
synchronous ORM and PDF/import code. RQ is the best fit for the current bounded
queue; the persistent model keeps a later broker migration possible.

## Guarantees

- states are `pending`, `running`, `succeeded`, `failed`, `cancelled`, or
  `expired`, with timestamps, progress, error codes, requester and resource;
- the worker reloads the user and rechecks map/trip permissions immediately
  before execution;
- jobs have bounded timeouts and retry metadata, deterministic RQ IDs and
  application-level deduplication keys;
- interrupted `running` tasks are explicitly failed as `worker_interrupted` on
  worker startup rather than being silently lost or duplicated;
- RQ's failed registry is the operational dead-letter queue, while the safe
  failure displayed to users remains in PostgreSQL;
- imports and exports are referenced through shared storage volumes, never
  serialized into Redis;
- logs include the task UUID and type and do not include task input or secrets.

## Operations

Inspect the services:

```sh
docker compose --env-file docker/.env -f docker/compose.yml ps
docker compose --env-file docker/.env -f docker/compose.yml logs worker redis
```

Scale workers without scaling the API:

```sh
docker compose --env-file docker/.env -f docker/compose.yml up -d --scale worker=2
```

Redis uses AOF (`appendfsync everysec`), authentication, `noeviction`, a 256 MiB
limit and no published port. If Redis is unavailable, new asynchronous requests
fail with HTTP 503 and an auditable `broker_unavailable` task. Completed files
and their authorization metadata remain available from PostgreSQL/shared
storage until expiry.

For local development without Redis, leave `CARTAVAULT_TASK_MODE=sync`. This is
a functional fallback, not the production multi-process configuration.

## Cleanup and recovery

Task and export expiration is represented in PostgreSQL. Expired or abandoned
rows are reconciled when a worker starts. KMZ preview and export files use
unguessable storage names and are resolved only after ownership/role checks.
Operational cleanup may delete files only after their database expiry; Redis
keys can be rebuilt from pending PostgreSQL tasks and are never backed up as
business data.
