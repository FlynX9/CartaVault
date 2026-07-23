# Instance Status

The **Administration → Instance Status** section provides a concise operational diagnosis for CartaVault. It is restricted to global administrators in both the UI and API. It does not replace Prometheus/Grafana, centralized logging, backup and restore procedures, or a formal security audit.

## API, cache, and units

- `GET /admin/console/instance` returns the latest available measurement.
- `POST /admin/console/instance/refresh` forces a new measurement.
- The cache is process-local, lasts 30 seconds, and serializes concurrent refreshes.
- Dates use UTC ISO 8601; sizes use bytes; latency uses milliseconds; durations use seconds; percentages are numeric values.

## States and aggregation

- `operational`: the check succeeded without a significant alert.
- `degraded`: the service is usable, but a non-critical action is recommended.
- `unavailable`: a required component is unavailable.
- `misconfigured`: required or secure configuration is missing, especially in production.
- `unknown`: no reliable source of truth is available.

The aggregate status is `unavailable` when the application, PostgreSQL/PostGIS, or storage is unavailable. It is `misconfigured` when a required component or important security check is misconfigured. Optional anomalies result in `degraded`. Unknown data is never treated as success.

## Measurements and known limits

Checks cover the application, PostgreSQL/PostGIS, Alembic, local storage, functional volumes, sessions, HTTPS, Resend, mapping, OSRM, maintenance, backups, and security configuration.

- Storage is probed with a temporary file that is immediately removed; no full host path is exposed. Thresholds are 70% warning, 85% high, and 95% critical.
- OSRM uses a lightweight request capped at two seconds. No billable Google Routes call or user-key decryption is performed.
- Resend is assessed only from local metadata. No email and no provider call are sent.
- If TLS terminates at an external proxy, certificate, HSTS, and redirect status remain `unknown` because the application has no proof.
- The application does not yet maintain a structured history of email deliveries or application errors. Shown errors are current check failures only, without stack traces or payloads.
- No backup, Redis, or worker subsystem is declared. Their state stays `unknown`; no backup evidence is fabricated.
- Active totals exclude deleted users and places; deleted places are counted separately.

## Privacy and extension

The response contains no user name or email, POI content, token, connection string, API key, or encryption key. Errors use stable codes. Non-administrators receive `403`.

When adding a check, create an explicit schema, an isolated function, a stable error code, and an accessible UI rendering. Every external dependency must have a maximum timeout, remain non-billable during passive reads, and not prevent other components from being checked. Cover aggregation, isolation, redaction, and rendering with tests.

Database tests must exclusively target `cartavault_test`.
