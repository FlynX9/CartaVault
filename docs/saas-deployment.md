# Production SaaS deployment on one VPS

This guide is the reference baseline for the first CartaVault SaaS instance: approximately 50 registered users on one Ubuntu Server 24.04 LTS x86-64 VPS with 4 vCPU, 8 GB RAM and 75–100 GB NVMe. Capacity remains a measurement, not a promise; run the supplied smoke/load procedure with representative data before onboarding users.

## Architecture

```text
Internet :80/:443
        |
        v
Nginx (TLS, limits, headers, logs)
        |
        v private Docker network
CartaVault :8000 (one container, three configurable Uvicorn workers)
        |
        v
PostgreSQL/PostGIS :5432 (private network only)
```

Only Nginx publishes host ports. CartaVault uses `expose`, not `ports`, and PostGIS has no host binding. The private network is marked `internal`. The deployment consumes the immutable GHCR release image; it does not build source code on the VPS.

The application container runs as the non-root `cartavault` user with a read-only root filesystem, all capabilities dropped and only explicit data volumes plus `/tmp` writable. Nginx retains only the three capabilities required for its root master to switch to unprivileged workers; it listens on unprivileged container ports 8080/8443.

## Prepare Ubuntu 24.04

1. Create a named sudo-capable operator and install the operator's SSH public key.
2. Set `PermitRootLogin no` and `PasswordAuthentication no` in an SSH drop-in, validate with `sshd -t`, then reload SSH without closing the current session.
3. Install security updates, `unattended-upgrades`, `ufw`, `fail2ban`, `chrony`, Docker Engine and the Compose v2 plugin from Docker's official Ubuntu repository.
4. Permit only SSH, HTTP and HTTPS (`22/tcp`, `80/tcp`, `443/tcp`) in UFW and the OVH firewall. Keep both layers enabled.
5. Create `/opt/cartavault`, owned by the deployment operator. Do not install Portainer or expose the Docker socket.

Use a separate host, database, bucket and encryption key for development, beta and production.

## DNS and initial TLS certificate

Point the application hostname (for example `app.cartavault.fr`) to the VPS before requesting a certificate. The public marketing site can remain on `cartavault.fr` independently.

Install the Ubuntu `certbot` package, then serve only the ACME directory temporarily:

```sh
sudo mkdir -p /opt/cartavault/acme
docker run --detach --name cartavault-acme-bootstrap \
  --publish 80:8080 \
  --mount type=bind,src=/opt/cartavault/docker/nginx/bootstrap.conf,dst=/etc/nginx/conf.d/default.conf,readonly \
  --mount type=bind,src=/opt/cartavault/acme,dst=/var/www/certbot,readonly \
  nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
sudo certbot certonly --webroot --webroot-path /opt/cartavault/acme \
  --domain app.cartavault.fr --email operator@example.com --agree-tos --no-eff-email
docker rm --force cartavault-acme-bootstrap
```

Certbot's systemd timer renews the webroot certificate. Add an executable deploy hook at `/etc/letsencrypt/renewal-hooks/deploy/cartavault-nginx`:

```sh
#!/bin/sh
docker compose --env-file /opt/cartavault/.env \
  --file /opt/cartavault/docker/compose.saas.yml exec -T nginx nginx -s reload
```

Verify `systemctl list-timers certbot.timer` and run `sudo certbot renew --dry-run` after the stack is online. Alert before certificate expiry; automatic renewal is not a substitute for monitoring.

## Configure secrets

Copy `docker/.env.saas.example` to `/opt/cartavault/.env`, set mode `0600`, and generate independent random values. Never put the file in Git, an image layer, a support bundle or a screenshot.

Required recovery material includes the PostgreSQL password, session/setup secrets and `CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY`. Losing the encryption key makes saved provider credentials unrecoverable. Store a protected copy separately from database and media backups.

The default three workers each own a SQLAlchemy pool of five persistent plus five overflow connections. The theoretical application ceiling is therefore 30 connections. Keep that calculation below PostgreSQL `max_connections` after reserving connections for migrations, backup and operations:

```text
workers × (pool_size + max_overflow) + operational reserve <= max_connections
```

Start with the supplied values, measure connection usage and memory, then tune. Do not increase workers blindly.

## Deploy and verify

Copy only `docker/compose.saas.yml`, `docker/nginx/` and the protected `.env` to `/opt/cartavault`, then:

```sh
cd /opt/cartavault
docker compose --env-file .env --file docker/compose.saas.yml config --quiet
docker compose --env-file .env --file docker/compose.saas.yml pull
docker compose --env-file .env --file docker/compose.saas.yml up -d
docker compose --env-file .env --file docker/compose.saas.yml ps
curl --fail https://app.cartavault.fr/healthz
curl --fail https://app.cartavault.fr/health/ready
```

The entrypoint waits for PostgreSQL, acquires a PostgreSQL migration lock, upgrades to all Alembic heads and bootstraps the administrator before Uvicorn starts. A migration failure prevents traffic. Across Uvicorn workers, a PostgreSQL advisory lock elects one maintenance leader; routing optimization proposals live in PostgreSQL rather than process memory.

Nginx applies coarse per-IP limits to authentication and API traffic while backend authorization, CSRF and endpoint-specific limits remain authoritative. It sends a request ID, trusted forwarding headers, upload/time limits and security headers. CartaVault owns the route-aware CSP because API documentation needs a narrower explicit exception. Authenticated API responses are never proxy-cached; hashed frontend assets are immutable.

## Logs and monitoring

All three services use Docker's `json-file` driver with five 10 MB files. Inspect them with:

```sh
docker compose --env-file .env --file docker/compose.saas.yml logs --since 30m nginx cartavault postgis
```

Never log request bodies, passwords, tokens, API credentials or signed object URLs. Monitor external HTTPS availability, both health endpoints, container health/restarts, CPU, RAM, NVMe usage, PostgreSQL connections, backup age/result, TLS expiry and object-storage usage. Initial alerts should include application/DB unavailable, disk above 80%, backup failure or age breach, and certificate renewal failure.

## Backups and restore

Run `docker/backup.sh` daily and copy completed, checksummed recovery sets off the VPS. VPS snapshots are an additional layer, never the only database backup. Protect at least daily, weekly and monthly generations according to the operator's retention policy. Test a restore into an isolated Compose project at least quarterly using `docker/restore.sh`, then verify schema heads, login, one representative map, one photo and an encrypted provider credential.

See [Backup and restore](backup-and-restore.md) for destructive-operation safeguards and the full drill. Object-storage durability/versioning and deletion recovery must be configured separately when the S3 media backend is enabled.

## Upgrade and rollback

Before every upgrade, verify an off-host backup and record the current image digest. Change only `CARTAVAULT_VERSION`, then run `compose pull`, inspect the release and run `compose up -d`. Verify health, login, a map, media and a safe write.

Rollback by restoring the previous immutable version tag only when its schema is compatible. Otherwise restore the matching complete database/media recovery set. Never run an automatic Alembic downgrade in production.

## Performance gate before onboarding

Using demo data comparable to production, record API p50/p95 latency, errors, worker RSS, CPU, PostgreSQL connections and response sizes for login/session checks, map markers, POI detail/search, trip loading, representative writes and media metadata. Test image processing, imports and PDF generation separately. Scale the VPS or introduce the already optional Redis worker only when measurements justify it; V1 does not use replicas, Swarm, Kubernetes, PgBouncer or a Redis cluster.

## Troubleshooting

- Nginx will not start: verify the hostname certificate exists under `/etc/letsencrypt/live/<hostname>` and `nginx -t` passes.
- `not_ready`: inspect PostGIS health and migration logs; do not bypass readiness.
- Database pool timeouts: inspect `pg_stat_activity`, slow requests and the worker/pool formula before increasing limits.
- Upload rejected by Nginx: keep `CARTAVAULT_NGINX_MAX_BODY_SIZE` above the largest administrator-configurable media limit while retaining backend validation.
- Repeated restarts after upgrade: pin the previous image only if schema-compatible; otherwise execute the tested full restore.
