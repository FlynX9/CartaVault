-- Infrastructure prerequisites only. Alembic owns every CartaVault table,
-- constraint, index, function, trigger, and application seed.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
