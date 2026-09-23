#!/usr/bin/env sh
# Cross-sourced writer state is defined and consumed across helper boundaries.
# shellcheck disable=SC2016,SC2034,SC2154
set -eu

script_directory="$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)"
s3_helper="${CARTAVAULT_S3_RECOVERY_HELPER:-$script_directory/s3_recovery.py}"
writer_quiescence_helper="${CARTAVAULT_WRITER_QUIESCENCE_HELPER:-$script_directory/writer_quiescence.sh}"
operation_safety_helper="${CARTAVAULT_OPERATION_SAFETY_HELPER:-$script_directory/operation_safety.sh}"
compose_file="${CARTAVAULT_COMPOSE_FILE:-$script_directory/compose.yml}"
compose_extra_file="${CARTAVAULT_COMPOSE_EXTRA_FILE:-}"
compose_project="${CARTAVAULT_COMPOSE_PROJECT:-}"
backup_root="${1:-}"
backup_started_at="$(date +%s)"
destination=""
quiesce_started_at=0
quiesce_finished_at=0

compose() {
  if [ -n "$compose_project" ]; then
    if [ -n "$compose_extra_file" ]; then
      docker compose --project-name "$compose_project" -f "$compose_file" -f "$compose_extra_file" "$@" 9>&-
    else
      docker compose --project-name "$compose_project" -f "$compose_file" "$@" 9>&-
    fi
  else
    if [ -n "$compose_extra_file" ]; then
      docker compose -f "$compose_file" -f "$compose_extra_file" "$@" 9>&-
    else
      docker compose -f "$compose_file" "$@" 9>&-
    fi
  fi
}

# Resolve the actual deployed Compose file set and serialize all recovery work.
# shellcheck source=/dev/null
. "$operation_safety_helper"

# Keep writer discovery and safety barriers identical between backup and restore.
# shellcheck source=/dev/null
. "$writer_quiescence_helper"

bind_source() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -am "$1"
  else
    printf '%s' "$1"
  fi
}

s3_tool() {
  compose run --rm --no-deps -T --user 0:0 \
    -e "CARTAVAULT_BACKUP_TESTING=${CARTAVAULT_BACKUP_TESTING:-false}" \
    -e "CARTAVAULT_S3_TEST_FAILURE_PHASE=${CARTAVAULT_S3_TEST_FAILURE_PHASE:-}" \
    -e "CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES=${CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES:-}" \
    -v "$(bind_source "$s3_helper"):/opt/cartavault/s3_recovery.py:ro" \
    -v "$(bind_source "$destination"):/app/recovery-backup" \
    --entrypoint python cartavault /opt/cartavault/s3_recovery.py "$@"
}

wait_for_readiness() {
  elapsed=0
  timeout="${CARTAVAULT_BACKUP_READY_TIMEOUT_SECONDS:-120}"
  case "$timeout" in
    ''|*[!0-9]*|0) echo "CARTAVAULT_BACKUP_READY_TIMEOUT_SECONDS must be a positive integer." >&2; return 1 ;;
  esac
  while [ "$elapsed" -lt "$timeout" ]; do
    if compose exec -T cartavault python -c \
      "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health/ready', timeout=3)" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2 9>&-
    elapsed=$((elapsed + 2))
  done
  echo "CartaVault readiness did not succeed within ${timeout}s." >&2
  return 1
}

restart_writers() {
  if [ "$writer_quiesce_attempted" -eq 1 ]; then
    echo "[backup] Restarting quiesced writers."
    resume_api_writer || return 1
    if writer_was_active cartavault; then
      wait_for_readiness || return 1
    fi
    resume_worker_writer || return 1
    writer_quiesced=0
    writer_quiesce_attempted=0
    quiesce_finished_at="$(date +%s)"
  fi
}

inject_backup_pause() {
  phase="$1"
  if [ "${CARTAVAULT_BACKUP_TESTING:-false}" = "true" ] && [ "${CARTAVAULT_BACKUP_TEST_PAUSE_AT:-}" = "$phase" ]; then
    pause_seconds="${CARTAVAULT_BACKUP_TEST_PAUSE_SECONDS:-300}"
    echo "[backup:test] Pausing at $phase for ${pause_seconds}s."
    while [ "$pause_seconds" -gt 0 ]; do
      sleep 1 9>&-
      pause_seconds=$((pause_seconds - 1))
    done
  fi
}

handle_exit() {
  status=$?
  trap - EXIT INT TERM
  set +e
  if [ "$status" -ne 0 ] && [ -n "$destination" ]; then
    rm -f "$destination/COMPLETED"
    echo "ERROR: backup is incomplete and must not be restored: $destination" >&2
  fi
  if [ "$writer_quiesce_attempted" -eq 1 ]; then
    if ! restart_writers; then
      echo "ERROR: one or more writers did not restart after backup failure. MANUAL RECOVERY REQUIRED." >&2
    fi
  fi
  release_operation_lock
  exit "$status"
}

handle_signal() {
  case "$1" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}

trap handle_exit EXIT
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM

if [ -z "$backup_root" ]; then
  echo "Usage: $0 /absolute/backup/directory" >&2
  exit 2
fi

case "$backup_root" in
  /*) ;;
  *) echo "Backup directory must be an absolute path." >&2; exit 2 ;;
esac

case "${CARTAVAULT_BACKUP_EXPORTS:-false}" in
  true|false) ;;
  *) echo "CARTAVAULT_BACKUP_EXPORTS must be true or false." >&2; exit 2 ;;
esac

resolve_authoritative_compose
acquire_operation_lock
verify_no_restore_leftovers

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp"
if ! mkdir "$destination"; then
  echo "Backup destination already exists or cannot be created: $destination" >&2
  exit 2
fi

echo "[backup] Checking PostgreSQL."
compose exec -T postgis \
  sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

storage_mode="$(compose run --rm --no-deps -T --entrypoint sh cartavault -c 'printf "%s" "${MEDIA_STORAGE:-local}"')"
case "$storage_mode" in
  local|s3) ;;
  *) echo "Unsupported MEDIA_STORAGE value: $storage_mode" >&2; exit 2 ;;
esac

if [ "$storage_mode" = "s3" ]; then
  echo "[backup] Checking S3 bucket, prefix, credentials, and restore leftovers."
  s3_config="$(s3_tool inspect)"
  s3_bucket="$(printf '%s\n' "$s3_config" | sed -n 's/^bucket=//p')"
  s3_prefix="$(printf '%s\n' "$s3_config" | sed -n 's/^prefix=//p')"
  case "$s3_bucket:$s3_prefix" in
    *'\n'*|*'\r'*|*'='*) echo "S3 bucket/prefix contains unsupported manifest characters." >&2; exit 2 ;;
  esac
fi

echo "[backup] Quiescing all configured writers for a coherent recovery point."
quiesce_started_at="$(date +%s)"
writer_quiesce_context=backup
if ! quiesce_writers; then
  echo "ERROR: backup quiescence barrier failed: ${writer_quiesce_failure}. No recovery set will be completed." >&2
  exit 1
fi

echo "[backup] Exporting PostgreSQL."
compose exec -T postgis \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$destination/database.dump"
compose exec -T postgis \
  sh -c 'set -eu; temporary_dump="$(mktemp)"; trap '\''rm -f "$temporary_dump"'\'' EXIT; cat > "$temporary_dump"; pg_restore --list "$temporary_dump" >/dev/null' \
  < "$destination/database.dump"

if [ "$storage_mode" = "s3" ]; then
  echo "[backup] Capturing database-backed S3 references."
  compose exec -T postgis sh -c '
    set -eu
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
      "SELECT path || '\''|'\'' || COALESCE(file_size_bytes::text, '\'''\'') FROM photos WHERE path IS NOT NULL
       UNION ALL
       SELECT file_path || '\''|'\'' || file_size_bytes::text FROM trip_night_photos
       ORDER BY 1"
  ' > "$destination/s3-database-references.tsv"

  echo "[backup] Streaming the complete CartaVault S3 prefix into the recovery set."
  s3_stats="$(s3_tool backup \
    --directory recovery-backup/.s3-objects-partial \
    --archive recovery-backup/s3-objects.tar.gz \
    --manifest recovery-backup/s3-objects.jsonl)"
  echo "[backup] S3 capture: $s3_stats."
  s3_object_count="$(printf '%s' "$s3_stats" | sed -n 's/.*objects=\([0-9][0-9]*\).*/\1/p')"
  s3_total_bytes="$(printf '%s' "$s3_stats" | sed -n 's/.*bytes=\([0-9][0-9]*\).*/\1/p')"
  case "$s3_object_count" in ''|*[!0-9]*) echo "Unable to parse S3 backup object count." >&2; exit 1 ;; esac
  case "$s3_total_bytes" in ''|*[!0-9]*) echo "Unable to parse S3 backup byte count." >&2; exit 1 ;; esac
  s3_tool validate-references \
    --manifest recovery-backup/s3-objects.jsonl \
    --references recovery-backup/s3-database-references.tsv
  inject_backup_pause s3_captured
fi

echo "[backup] Exporting local media volumes."
if [ "$storage_mode" = "local" ]; then
  compose run --rm --no-deps --user 0:0 \
    -v "$(bind_source "$destination"):/backup" \
    --entrypoint sh cartavault \
    -c 'tar -czf /backup/photos.tar.gz -C /app/storage/photos . && tar -czf /backup/avatars.tar.gz -C /app/storage/avatars .'
  set -- "database.dump" "photos.tar.gz" "avatars.tar.gz"
else
  compose run --rm --no-deps --user 0:0 \
    -v "$(bind_source "$destination"):/backup" \
    --entrypoint sh cartavault \
    -c 'tar -czf /backup/avatars.tar.gz -C /app/storage/avatars .'
  set -- "database.dump" "avatars.tar.gz" "s3-objects.tar.gz" "s3-objects.jsonl" "s3-database-references.tsv"
fi
if [ "${CARTAVAULT_BACKUP_EXPORTS:-false}" = "true" ]; then
  echo "[backup] Exporting temporary exports."
  compose run --rm --no-deps --user 0:0 \
    -v "$(bind_source "$destination"):/backup" \
    --entrypoint sh cartavault \
    -c 'tar -czf /backup/exports.tar.gz -C /app/storage/exports .'
  set -- "$@" "exports.tar.gz"
fi

inject_backup_pause capture_complete

cat > "$destination/manifest.txt" <<EOF
format_version=2
created_at=$timestamp
cartavault_version=${CARTAVAULT_VERSION:-unknown}
database_format=postgresql-custom
storage_backend=$storage_mode
exports_included=${CARTAVAULT_BACKUP_EXPORTS:-false}
completed=true
EOF

if [ "$storage_mode" = "s3" ]; then
  cat >> "$destination/manifest.txt" <<EOF
s3_bucket=$s3_bucket
s3_prefix=$s3_prefix
s3_object_count=$s3_object_count
s3_total_bytes=$s3_total_bytes
s3_recovery_artifact=s3-objects.tar.gz
s3_object_manifest=s3-objects.jsonl
s3_captured_at=$timestamp
EOF
fi

set -- "$@" "manifest.txt"
(unset CDPATH; cd -- "$destination" && sha256sum "$@" > SHA256SUMS) 9>&-
printf 'cartavault-backup-v2\n' > "$destination/COMPLETED"

restart_writers

echo "[backup] Completed: $destination"
backup_finished_at="$(date +%s)"
if [ "$storage_mode" = "s3" ]; then
  echo "[backup] Observed timing: quiesce=$((quiesce_finished_at - quiesce_started_at))s total=$((backup_finished_at - backup_started_at))s objects=$s3_object_count bytes=$s3_total_bytes."
else
  echo "[backup] Observed timing: quiesce=$((quiesce_finished_at - quiesce_started_at))s total=$((backup_finished_at - backup_started_at))s."
fi
