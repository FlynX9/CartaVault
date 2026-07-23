# Administration settings audit

This inventory accompanies the `/admin` console. It classifies settings without exposing secrets and prevents the browser from becoming a deployment-configuration editor.

## 1. Managed through the interface

| Item | Storage | Interface |
|---|---|---|
| Accounts, roles, and activation | PostgreSQL (`users`) | Administration > Users |
| Registration requests | PostgreSQL | Administration > Users |
| Global Resend key | PostgreSQL, Fernet-encrypted | Administration > API keys; the value is never read back |
| Global quotas | PostgreSQL (`system_settings`) | Administration > Quotas and usage |
| User quota overrides | `users.preferences.quota_limits` | Administration > Quotas and usage |
| Personal Google Routes key | PostgreSQL, encrypted and tied to the account | Account > Preferences; never in global administration |

The quotas currently cover maps, places, members, individual photo-file size, and photo storage. Exceeding a quota blocks only the new write through a domain error; no existing data is removed.

## 2. Read-only information

- CartaVault version (`CARTAVAULT_VERSION`);
- PostgreSQL/PostGIS availability and version;
- active Alembic revision;
- photo-storage health and disk space;
- presence of the encryption master key, without its value;
- short-timeout OSRM availability;
- email configuration status;
- user, map, place, and photo counters;
- number of accounts with a personal Google Routes key, without exposing values or detailed identities.

## 3. Deployment-only settings

- `DATABASE_URL`, `TEST_DATABASE_URL`;
- `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`;
- cookie, CSRF, session, Argon2, and bootstrap-administrator settings;
- CORS origins;
- `PHOTO_STORAGE_PATH` and `AVATAR_STORAGE_PATH`;
- OSRM URL, profile, timeouts, and limits;
- Google Routes URL and timeouts;
- email sender identity and public frontend URL;
- KMZ security limits;
- map-provider, style, and `VITE_*` URLs;
- `VITE_API_BASE_URL`.

These values are neither returned in full to the frontend nor editable in the browser. An external origin is only identified as such when relevant.

## 4. Future work

- Persistent administrative audit log.
- Centralized rate limiting for administrative mutations.
- Persistent metrics for imports, exports, routing calculations, and Google Routes consumption.
- Filtered and actionable application-error log in the instance-status page.
- Quota warnings and notifications before a limit blocks a write.
- Global management for additional credential providers.
- Two-factor authentication and enterprise policies.

## Historical surfaces

The former user panel embedded in the map workspace is no longer routed. Legacy `/admin/users` endpoints are retained temporarily for compatibility, while the console uses paginated `/admin/console/*` endpoints. Their removal can be addressed by a deprecation issue after external clients have been checked.
