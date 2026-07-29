#!/usr/bin/env sh
set -eu

compose_file="${CARTAVAULT_COMPOSE_FILE:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yml}"
compose_project="${CARTAVAULT_COMPOSE_PROJECT:-}"
backup_directory="${1:-}"

compose() {
  if [ -n "$compose_project" ]; then
    docker compose --project-name "$compose_project" -f "$compose_file" "$@"
  else
    docker compose -f "$compose_file" "$@"
  fi
}

if [ -z "$backup_directory" ] || [ ! -f "$backup_directory/database.dump" ]; then
  echo "Usage: CARTAVAULT_RESTORE_CONFIRM=restore $0 /absolute/backup/directory" >&2
  exit 2
fi
if [ "${CARTAVAULT_RESTORE_CONFIRM:-}" != "restore" ]; then
  echo "Restore refused. Set CARTAVAULT_RESTORE_CONFIRM=restore explicitly." >&2
  exit 2
fi

echo "[restore] Verifying backup checksums."
(cd "$backup_directory" && sha256sum -c SHA256SUMS)

echo "[restore] Stopping application services."
compose stop frontend backend

echo "[restore] Recreating the configured database."
compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
cat "$backup_directory/database.dump" | compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error'

echo "[restore] Restoring media volumes."
compose run --rm --no-deps \
  -v "$backup_directory:/backup:ro" \
  --entrypoint sh backend \
  -c 'find /app/storage/photos -mindepth 1 -delete; find /app/storage/avatars -mindepth 1 -delete; tar -xzf /backup/photos.tar.gz -C /app/storage/photos; tar -xzf /backup/avatars.tar.gz -C /app/storage/avatars'

echo "[restore] Migrating the restored database and restarting CartaVault."
compose run --rm migrate
compose up -d backend frontend
compose ps
