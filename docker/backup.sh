#!/usr/bin/env sh
set -eu

compose_file="${CARTAVAULT_COMPOSE_FILE:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/compose.yml}"
compose_project="${CARTAVAULT_COMPOSE_PROJECT:-}"
backup_root="${1:-}"

compose() {
  if [ -n "$compose_project" ]; then
    docker compose --project-name "$compose_project" -f "$compose_file" "$@"
  else
    docker compose -f "$compose_file" "$@"
  fi
}

if [ -z "$backup_root" ]; then
  echo "Usage: $0 /absolute/backup/directory" >&2
  exit 2
fi

case "$backup_root" in
  /*) ;;
  *) echo "Backup directory must be an absolute path." >&2; exit 2 ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp"
mkdir -p "$destination"

echo "[backup] Checking PostgreSQL."
compose exec -T postgis \
  sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "[backup] Exporting PostgreSQL."
compose exec -T postgis \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$destination/database.dump"

echo "[backup] Exporting photo and avatar volumes."
compose run --rm --no-deps \
  -v "$destination:/backup" \
  --entrypoint sh cartavault \
  -c 'tar -czf /backup/photos.tar.gz -C /app/storage/photos . && tar -czf /backup/avatars.tar.gz -C /app/storage/avatars .'

set -- "$destination/database.dump" "$destination/photos.tar.gz" "$destination/avatars.tar.gz"
if [ "${CARTAVAULT_BACKUP_EXPORTS:-false}" = "true" ]; then
  echo "[backup] Exporting temporary exports."
  compose run --rm --no-deps \
    -v "$destination:/backup" \
    --entrypoint sh cartavault \
    -c 'tar -czf /backup/exports.tar.gz -C /app/storage/exports .'
  set -- "$@" "$destination/exports.tar.gz"
fi

cat > "$destination/manifest.txt" <<EOF
created_at=$timestamp
cartavault_version=${CARTAVAULT_VERSION:-unknown}
database_format=postgresql-custom
exports_included=${CARTAVAULT_BACKUP_EXPORTS:-false}
EOF

sha256sum "$@" > "$destination/SHA256SUMS"

echo "[backup] Completed: $destination"
