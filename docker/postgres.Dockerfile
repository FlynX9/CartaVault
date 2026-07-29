FROM postgis/postgis:16-3.4

# PostgreSQL initialization owns extensions only. Alembic owns the application
# schema and seed data.
COPY database/init/010_extensions.sql /docker-entrypoint-initdb.d/010_extensions.sql
