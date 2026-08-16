# Database migration and downgrade policy

## Production policy

CartaVault production startup only performs `alembic upgrade heads`. A failed
upgrade blocks application startup. Production never runs an automatic
downgrade.

Rollback normally means deploying the previous immutable application image
only when its schema is compatible. If a release crossed an incompatible
schema boundary, restore the matching complete database/media backup instead
of attempting an arbitrary historical downgrade.

## Supported downgrade window

Every new migration must provide and test a downgrade to its direct parent.
Representative older migrations retain focused round-trip tests where data
conversion is important. CartaVault does not promise that an arbitrary chain
from the current release to the initial revision preserves current data or
remains operational; such a chain is not a production rollback mechanism.

## Test isolation

Normal integration tests use the database named by `TEST_DATABASE_URL`. The
session fixture rebuilds it at current model head and verifies at teardown that
its Alembic revision still equals every repository head.

Every migration-cycle test instead receives a unique PostgreSQL database named
`cartavault_mig_<worker>_<uuid>`. It has its own schema and `alembic_version`
table. The helper:

1. creates the database from `template0`;
2. points an independent Alembic `Config` and engine to it;
3. reports database name, source revision, operation and target on failure;
4. disposes all connections and force-drops the database in `finally`.

Names include the future pytest-xdist worker ID and a UUID, so parallel or
repeated CI jobs do not collide. A failed assertion or migration cannot leave
the shared integration schema at an intermediate revision. Migration tests
must use the `migration_environment` fixture or
`provision_migration_environment`; they must never call downgrade against
`test_engine` or `DATABASE_URL`.
