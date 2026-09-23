---
title: Environment variables
description: Reference generated from backend `os.getenv` calls.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

Sensitive values are never reproduced. A `dynamic` value is computed in code.

| Variable | Default | Source |
| --- | --- | --- |
| `AVATAR_STORAGE_PATH` | `storage/avatars` | `backend/app/auth/avatar_storage.py` |
| `CARTAVAULT_API_PREFIX` | — | `backend/app/main.py` |
| `CARTAVAULT_API_ROOT_PATH` | required / empty | `backend/app/main.py` |
| `CARTAVAULT_ARCGIS_API_KEY` | sensitive value | `backend/app/config.py` |
| `CARTAVAULT_ARCGIS_SESSION_DURATION_SECONDS` | `43200` | `backend/app/config.py` |
| `CARTAVAULT_ARCGIS_TIMEOUT_SECONDS` | `10` | `backend/app/config.py` |
| `CARTAVAULT_ARGON2_MEMORY_COST` | `65536` | `backend/app/config.py` |
| `CARTAVAULT_ARGON2_PARALLELISM` | `4` | `backend/app/config.py` |
| `CARTAVAULT_ARGON2_TIME_COST` | `3` | `backend/app/config.py` |
| `CARTAVAULT_BACKEND_REPLICAS` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL` | — | `backend/app/cli.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_NAME` | — | `backend/app/cli.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD` | sensitive value | `backend/app/cli.py` |
| `CARTAVAULT_BUILD_COMMIT` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_BUILD_DATE` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_CGROUP_ROOT` | `/sys/fs/cgroup` | `backend/app/instance_status/service.py` |
| `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` | sensitive value | `backend/app/config.py` |
| `CARTAVAULT_CSRF_COOKIE_NAME` | `cartavault_csrf` | `backend/app/config.py` |
| `CARTAVAULT_DATABASE_CONNECT_TIMEOUT_SECONDS` | `5` | `backend/app/config.py` |
| `CARTAVAULT_DB_POOL_RECYCLE_SECONDS` | `1800` | `backend/app/config.py` |
| `CARTAVAULT_DB_POOL_SIZE` | `5` | `backend/app/config.py` |
| `CARTAVAULT_DB_POOL_TIMEOUT_SECONDS` | `30` | `backend/app/config.py` |
| `CARTAVAULT_DEPLOYMENT_MODE` | `local` | `backend/app/instance_status/service.py` |
| `CARTAVAULT_ENVIRONMENT` | dynamic | `backend/app/instance_status/service.py` |
| `CARTAVAULT_ENV_FILE` | `/config/.env` | `backend/app/setup_cli.py` |
| `CARTAVAULT_FORWARDED_ALLOW_IPS` | required / empty | `backend/app/container_entrypoint.py` |
| `CARTAVAULT_FRONTEND_DIST` | — | `backend/app/main.py` |
| `CARTAVAULT_FRONTEND_VERSION` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_GOOGLE_ROUTES_RATE_WINDOW_SECONDS` | `60` | `backend/app/config.py` |
| `CARTAVAULT_GOOGLE_ROUTES_REQUESTS_PER_MINUTE` | `120` | `backend/app/config.py` |
| `CARTAVAULT_INSTANCE_ID` | `unknown` | `backend/app/main.py` |
| `CARTAVAULT_INVITATION_HOURS` | `168` | `backend/app/config.py` |
| `CARTAVAULT_JAVA_EXECUTABLE` | `java` | `backend/app/config.py` |
| `CARTAVAULT_MAINTENANCE_LEADER_CHECK_INTERVAL_SECONDS` | `2` | `backend/app/config.py` |
| `CARTAVAULT_MAINTENANCE_LEADER_RECONNECT_INITIAL_SECONDS` | `1` | `backend/app/config.py` |
| `CARTAVAULT_MAINTENANCE_LEADER_RECONNECT_MAX_SECONDS` | `15` | `backend/app/config.py` |
| `CARTAVAULT_MAINTENANCE_PURGE_INTERVAL_SECONDS` | `3600` | `backend/app/config.py` |
| `CARTAVAULT_ORS_BASE_URL` | `https://api.openrouteservice.org` | `backend/app/config.py` |
| `CARTAVAULT_ORS_MAX_WAYPOINTS` | `50` | `backend/app/config.py` |
| `CARTAVAULT_ORS_REQUESTS_PER_MINUTE` | `40` | `backend/app/config.py` |
| `CARTAVAULT_ORS_TIMEOUT_SECONDS` | `15` | `backend/app/config.py` |
| `CARTAVAULT_PASSWORD_MIN_LENGTH` | sensitive value | `backend/app/config.py` |
| `CARTAVAULT_PDF_MAP_TILES_ENABLED` | `true` | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PDF_MAP_TILE_CACHE` | dynamic | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PDF_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PLANETILER_JAR` | `/opt/planetiler/planetiler-openmaptiles.jar` | `backend/app/config.py` |
| `CARTAVAULT_PLANETILER_JAVA_HEAP` | `2g` | `backend/app/config.py` |
| `CARTAVAULT_PLANETILER_TIMEOUT_SECONDS` | `21600` | `backend/app/config.py` |
| `CARTAVAULT_PUBLIC_URL` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_REGISTRATION_RETENTION_DAYS` | `30` | `backend/app/config.py` |
| `CARTAVAULT_REGISTRATION_VERIFICATION_HOURS` | `24` | `backend/app/config.py` |
| `CARTAVAULT_REVERSE_GEOCODING_MIN_INTERVAL_SECONDS` | `1` | `backend/app/config.py` |
| `CARTAVAULT_REVERSE_GEOCODING_TIMEOUT_SECONDS` | `8` | `backend/app/config.py` |
| `CARTAVAULT_REVERSE_GEOCODING_URL` | `https://nominatim.openstreetmap.org` | `backend/app/config.py` |
| `CARTAVAULT_REVERSE_GEOCODING_USER_AGENT` | `CartaVault/0.1 (self-hosted POI manager)` | `backend/app/config.py` |
| `CARTAVAULT_ROUTING_PROPOSAL_TTL_SECONDS` | `900` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_ACTIVITY_WRITE_INTERVAL_SECONDS` | `300` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_COOKIE_NAME` | `cartavault_session` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_DAYS` | `14` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_SECRET` | sensitive value | `backend/app/setup/service.py` |
| `CARTAVAULT_SETUP_TOKEN` | sensitive value | `backend/app/setup/service.py` |
| `CARTAVAULT_STORAGE_DELETE_BASE_BACKOFF_SECONDS` | `30` | `backend/app/config.py` |
| `CARTAVAULT_STORAGE_DELETE_CAP_BACKOFF_SECONDS` | `3600` | `backend/app/config.py` |
| `CARTAVAULT_STORAGE_DELETE_MAX_ATTEMPTS` | `8` | `backend/app/config.py` |
| `CARTAVAULT_STORAGE_RECONCILE_BATCH_SIZE` | `50` | `backend/app/config.py` |
| `CARTAVAULT_STORAGE_RECONCILE_INTERVAL_SECONDS` | `60` | `backend/app/config.py` |
| `CARTAVAULT_TASK_HEARTBEAT_SECONDS` | `30` | `backend/app/config.py` |
| `CARTAVAULT_TASK_LEASE_SECONDS` | `120` | `backend/app/config.py` |
| `CARTAVAULT_TASK_MODE` | `sync` | `backend/app/config.py` |
| `CARTAVAULT_TASK_QUEUE` | `cartavault` | `backend/app/config.py` |
| `CARTAVAULT_TASK_RECOVERY_BATCH_SIZE` | `25` | `backend/app/config.py` |
| `CARTAVAULT_TASK_RECOVERY_INTERVAL_SECONDS` | `30` | `backend/app/config.py` |
| `CARTAVAULT_TASK_RESULT_TTL_SECONDS` | `86400` | `backend/app/config.py` |
| `CARTAVAULT_TASK_STALE_AFTER_SECONDS` | `3600` | `backend/app/config.py` |
| `CARTAVAULT_TASK_TIMEOUT_SECONDS` | `1800` | `backend/app/config.py` |
| `CARTAVAULT_UVICORN_WORKERS` | `1` | `backend/app/container_entrypoint.py` |
| `CARTAVAULT_VECTOR_DOWNLOAD_TIMEOUT_SECONDS` | `3600` | `backend/app/config.py` |
| `CARTAVAULT_VECTOR_MAP_DIR` | `/data/maps` | `backend/app/config.py` |
| `CARTAVAULT_VECTOR_MAP_FONTS_PATH` | `/app/vector-assets/fonts` | `backend/app/config.py` |
| `CARTAVAULT_VERSION` | `development` | `backend/app/instance_status/service.py` |
| `CARTAVAULT_WORKERS` | — | `backend/app/instance_status/service.py` |
| `CORS_ALLOWED_ORIGINS` | — | `backend/app/main.py` |
| `DATABASE_URL` | — | `backend/app/database.py` |
| `EMAIL_FROM_ADDRESS` | `no-reply@cartavault.fr` | `backend/app/config.py` |
| `EMAIL_FROM_NAME` | `CartaVault` | `backend/app/config.py` |
| `EMAIL_PROVIDER` | `resend` | `backend/app/config.py` |
| `EMAIL_PROVIDER_MAX_ATTEMPTS` | `2` | `backend/app/config.py` |
| `EMAIL_PROVIDER_TIMEOUT_SECONDS` | `10` | `backend/app/config.py` |
| `EMAIL_REPLY_TO` | `contact@cartavault.fr` | `backend/app/config.py` |
| `EMAIL_SMTP_HOST` | required / empty | `backend/app/config.py` |
| `EMAIL_SMTP_PASSWORD` | sensitive value | `backend/app/config.py` |
| `EMAIL_SMTP_PORT` | `587` | `backend/app/config.py` |
| `EMAIL_SMTP_SECURITY` | `starttls` | `backend/app/config.py` |
| `EMAIL_SMTP_USERNAME` | required / empty | `backend/app/config.py` |
| `ENVIRONMENT` | `development` | `backend/app/instance_status/service.py` |
| `EXPORT_STORAGE_PATH` | dynamic | `backend/app/exports/temporary_exports.py` |
| `FRONTEND_PUBLIC_URL` | `http://localhost:5173` | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_API_KEY` | sensitive value | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_BASE_URL` | `https://routes.googleapis.com` | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_CONNECT_TIMEOUT_SECONDS` | `5` | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_TIMEOUT_SECONDS` | `15` | `backend/app/config.py` |
| `IMPORT_STORAGE_PATH` | dynamic | `backend/app/imports/service.py` |
| `MEDIA_STORAGE` | `local` | `backend/app/photos/object_storage.py` |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | `backend/app/config.py` |
| `OSRM_MAX_WAYPOINTS` | `50` | `backend/app/config.py` |
| `OSRM_PROFILE` | `driving` | `backend/app/config.py` |
| `OSRM_TIMEOUT_SECONDS` | `12` | `backend/app/config.py` |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | sensitive value | `backend/app/config.py` |
| `PYTEST_CURRENT_TEST` | — | `backend/app/basemaps/vector_service.py` |
| `REDIS_URL` | `redis://localhost:6379/0` | `backend/app/config.py` |
| `S3_ACCESS_KEY` | sensitive value | `backend/app/photos/object_storage.py` |
| `S3_BUCKET` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_CONNECT_TIMEOUT_SECONDS` | `5` | `backend/app/config.py` |
| `S3_ENDPOINT` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_FORCE_PATH_STYLE` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_MAX_ATTEMPTS` | `3` | `backend/app/config.py` |
| `S3_OPERATION_TIMEOUT_SECONDS` | `300` | `backend/app/config.py` |
| `S3_PREFIX` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_READ_TIMEOUT_SECONDS` | `30` | `backend/app/config.py` |
| `S3_REGION` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_RETRY_MODE` | `standard` | `backend/app/config.py` |
| `S3_SECRET_KEY` | sensitive value | `backend/app/photos/object_storage.py` |
| `S3_USE_SSL` | required / empty | `backend/app/photos/object_storage.py` |
| `S3_VERIFY_TLS` | required / empty | `backend/app/photos/object_storage.py` |
| `WEB_CONCURRENCY` | — | `backend/app/instance_status/service.py` |
