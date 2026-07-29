# Database infrastructure

## Purpose

This directory contains only PostgreSQL infrastructure prerequisites for
CartaVault.

## Schema ownership

Alembic migrations under `backend/migrations/` are the single source of truth
for every table, index, constraint, trigger, function, and application seed.
Files under `database/init/` are limited to idempotent PostgreSQL extensions
needed before migrations:

- `postgis`;
- `pgcrypto`.

Do not add table creation or mutable application data to PostgreSQL entrypoint
scripts. A clean installation must be reproducible with:

```powershell
Set-Location backend
python -m alembic upgrade heads
```

The production migration, administrator bootstrap, backup, restore, and
rollback lifecycle is documented in [`../docker/README.md`](../docker/README.md).
