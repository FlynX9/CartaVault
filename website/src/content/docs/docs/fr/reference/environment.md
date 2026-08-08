---
title: Variables d'environnement
description: Référence générée depuis les appels `os.getenv` du backend.
sidebar:
  order: 20
---

<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->

Les valeurs sensibles ne sont jamais reproduites. Une valeur `dynamic` est calculée dans le code.

| Variable | Default | Source |
| --- | --- | --- |
| `AVATAR_STORAGE_PATH` | `storage/avatars` | `backend/app/auth/avatar_storage.py` |
| `CARTAVAULT_API_PREFIX` | — | `backend/app/main.py` |
| `CARTAVAULT_API_ROOT_PATH` | required / empty | `backend/app/main.py` |
| `CARTAVAULT_BACKEND_REPLICAS` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_EMAIL` | — | `backend/app/cli.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_NAME` | — | `backend/app/cli.py` |
| `CARTAVAULT_BOOTSTRAP_ADMIN_PASSWORD` | sensitive value | `backend/app/cli.py` |
| `CARTAVAULT_BUILD_COMMIT` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_BUILD_DATE` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY` | sensitive value | `backend/app/config.py` |
| `CARTAVAULT_CSRF_COOKIE_NAME` | `cartavault_csrf` | `backend/app/config.py` |
| `CARTAVAULT_DEPLOYMENT_MODE` | `local` | `backend/app/instance_status/service.py` |
| `CARTAVAULT_ENVIRONMENT` | dynamic | `backend/app/instance_status/service.py` |
| `CARTAVAULT_ENV_FILE` | `/config/.env` | `backend/app/setup_cli.py` |
| `CARTAVAULT_FORWARDED_ALLOW_IPS` | required / empty | `backend/app/container_entrypoint.py` |
| `CARTAVAULT_FRONTEND_DIST` | — | `backend/app/main.py` |
| `CARTAVAULT_FRONTEND_VERSION` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_GOOGLE_MAP_TILES_BASE_URL` | `https://tile.googleapis.com` | `backend/app/config.py` |
| `CARTAVAULT_ORS_BASE_URL` | `https://api.openrouteservice.org` | `backend/app/config.py` |
| `CARTAVAULT_PDF_MAP_TILES_ENABLED` | `true` | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PDF_MAP_TILE_CACHE` | dynamic | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PDF_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `backend/app/trips/pdf_export.py` |
| `CARTAVAULT_PUBLIC_URL` | — | `backend/app/instance_status/service.py` |
| `CARTAVAULT_REVERSE_GEOCODING_URL` | `https://nominatim.openstreetmap.org` | `backend/app/config.py` |
| `CARTAVAULT_REVERSE_GEOCODING_USER_AGENT` | `CartaVault/0.1 (self-hosted POI manager)` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_COOKIE_NAME` | `cartavault_session` | `backend/app/config.py` |
| `CARTAVAULT_SESSION_SECRET` | sensitive value | `backend/app/setup/service.py` |
| `CARTAVAULT_SETUP_TOKEN` | sensitive value | `backend/app/setup/service.py` |
| `CARTAVAULT_TASK_MODE` | `sync` | `backend/app/config.py` |
| `CARTAVAULT_TASK_QUEUE` | `cartavault` | `backend/app/config.py` |
| `CARTAVAULT_VERSION` | `0.1.0` | `backend/app/instance_status/service.py` |
| `CORS_ALLOWED_ORIGINS` | — | `backend/app/main.py` |
| `DATABASE_URL` | — | `backend/app/database.py` |
| `EMAIL_FROM_ADDRESS` | `no-reply@cartavault.fr` | `backend/app/config.py` |
| `EMAIL_FROM_NAME` | `CartaVault` | `backend/app/config.py` |
| `EMAIL_PROVIDER` | `resend` | `backend/app/config.py` |
| `EMAIL_REPLY_TO` | `contact@cartavault.fr` | `backend/app/config.py` |
| `EMAIL_SMTP_HOST` | required / empty | `backend/app/config.py` |
| `EMAIL_SMTP_PASSWORD` | sensitive value | `backend/app/config.py` |
| `EMAIL_SMTP_SECURITY` | `starttls` | `backend/app/config.py` |
| `EMAIL_SMTP_USERNAME` | required / empty | `backend/app/config.py` |
| `ENVIRONMENT` | `development` | `backend/app/instance_status/service.py` |
| `EXPORT_STORAGE_PATH` | dynamic | `backend/app/exports/temporary_exports.py` |
| `FRONTEND_PUBLIC_URL` | `http://localhost:5173` | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_API_KEY` | sensitive value | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTES_BASE_URL` | `https://routes.googleapis.com` | `backend/app/config.py` |
| `GOOGLE_MAPS_ROUTING_PREFERENCE` | `TRAFFIC_UNAWARE` | `backend/app/config.py` |
| `IMPORT_STORAGE_PATH` | dynamic | `backend/app/imports/service.py` |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | `backend/app/config.py` |
| `OSRM_PROFILE` | `driving` | `backend/app/config.py` |
| `PHOTO_STORAGE_PATH` | dynamic | `backend/app/photos/storage.py` |
| `PYTEST_CURRENT_TEST` | — | `backend/app/main.py` |
| `REDIS_URL` | `redis://localhost:6379/0` | `backend/app/config.py` |
