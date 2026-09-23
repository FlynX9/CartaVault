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
backup_directory="${1:-}"
ready_timeout="${CARTAVAULT_RESTORE_READY_TIMEOUT_SECONDS:-120}"

restore_id="$(date -u +%Y%m%dT%H%M%SZ)_$$"
restore_started_at="$(date +%s)"
cutover_started_at=0
service_ready_at=0
temporary_directory="${TMPDIR:-/tmp}/cartavault-restore-$restore_id"
cutover_started=0
previous_media_ready=0
live_database=""
stage_database=""
previous_database=""
failed_database=""
database_prefix=""
photos_stage_volume=""
avatars_stage_volume=""
exports_stage_volume=""
photos_previous_volume=""
avatars_previous_volume=""
exports_previous_volume=""
storage_mode=""
s3_previous_ready=0
restore_initial_writer_services=""
s3_object_manifest="s3-objects.jsonl"
s3_recovery_artifact="s3-objects.tar.gz"

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
    -e "CARTAVAULT_RESTORE_TESTING=${CARTAVAULT_RESTORE_TESTING:-false}" \
    -e "CARTAVAULT_S3_TEST_FAILURE_PHASE=${CARTAVAULT_S3_TEST_FAILURE_PHASE:-}" \
    -e "CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES=${CARTAVAULT_S3_TEST_FAIL_AFTER_COPIES:-}" \
    -v "$(bind_source "$s3_helper"):/opt/cartavault/s3_recovery.py:ro" \
    -v "$(bind_source "$backup_directory"):/app/recovery-backup:ro" \
    -v "$(bind_source "$temporary_directory"):/app/recovery-work" \
    --entrypoint python cartavault /opt/cartavault/s3_recovery.py "$@"
}

log() {
  printf '%s\n' "$*"
}

error() {
  printf 'ERROR: %s\n' "$*" >&2
}

warning() {
  printf 'WARNING: %s\n' "$*" >&2
}

database_exists() {
  database_name="$1"
  [ "$(compose exec -T postgis sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname = '\''$1'\''"' sh "$database_name")" = "1" ]
}

terminate_database_connections() {
  database_name="$1"
  compose exec -T postgis sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$1'\'' AND pid <> pg_backend_pid()" >/dev/null' \
    sh "$database_name"
}

rename_database() {
  source_database="$1"
  target_database="$2"
  compose exec -T postgis sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE \"$1\" RENAME TO \"$2\"" >/dev/null' \
    sh "$source_database" "$target_database"
}

drop_database() {
  database_name="$1"
  compose exec -T postgis sh -c \
    'dropdb -U "$POSTGRES_USER" --if-exists --force "$1"' sh "$database_name"
}

validate_database() {
  database_name="$1"
  compose exec -T postgis sh -c '
    set -eu
    database_name="$1"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name" <<"SQL" >/dev/null
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    $name$alembic_version$name$, $name$users$name$, $name$poi_maps$name$,
    $name$places$name$, $name$photos$name$, $name$trips$name$
  ] LOOP
    IF to_regclass($name$public.$name$ || required_table) IS NULL THEN
      RAISE EXCEPTION $message$required table % is missing$message$, required_table;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM alembic_version
    WHERE version_num IS NOT NULL AND length(version_num) > 0
  ) THEN
    RAISE EXCEPTION $message$alembic_version has no active revision$message$;
  END IF;
END
$$;
SELECT version_num FROM alembic_version;
SELECT count(*) FROM users;
SELECT count(*) FROM poi_maps;
SELECT count(*) FROM places;
SELECT count(*) FROM photos;
SELECT count(*) FROM trips;
SQL
  ' sh "$database_name"
}

write_database_media_references() {
  database_name="$1"
  output_directory="$2"

  compose exec -T postgis sh -c '
    set -eu
    database_name="$1"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name" -Atc \
      "SELECT path || '\''|'\'' || COALESCE(file_size_bytes::text, '\'''\'') FROM photos WHERE path IS NOT NULL ORDER BY path"
  ' sh "$database_name" > "$output_directory/photos.expected"

  if [ "$(compose exec -T postgis sh -c 'psql -U "$POSTGRES_USER" -d "$1" -Atc "SELECT to_regclass('\''public.trip_night_photos'\'') IS NOT NULL"' sh "$database_name")" = "t" ]; then
    compose exec -T postgis sh -c '
      set -eu
      database_name="$1"
      psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name" -Atc \
        "SELECT file_path || '\''|'\'' || file_size_bytes::text FROM trip_night_photos ORDER BY file_path"
    ' sh "$database_name" >> "$output_directory/photos.expected"
  fi

  compose exec -T postgis sh -c '
    set -eu
    database_name="$1"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name" -Atc \
      "SELECT avatar_filename FROM users WHERE avatar_filename IS NOT NULL ORDER BY avatar_filename"
  ' sh "$database_name" > "$output_directory/avatars.expected"
}

validate_media_volume() {
  component="$1"
  volume_name="$2"
  expected_file="$3"

  compose run --rm --no-deps -T \
    -v "$volume_name:/restore-media:ro" \
    -v "$(bind_source "$temporary_directory"):/restore-metadata:ro" \
    --entrypoint sh cartavault -c '
      set -eu
      component="$1"
      expected_file="$2"
      symbolic_link="$(find /restore-media -type l -print -quit)"
      if [ -n "$symbolic_link" ]; then
        echo "staged $component archive contains a symbolic link" >&2
        exit 1
      fi
      unsupported_entry="$(find /restore-media ! -type f ! -type d -print -quit)"
      if [ -n "$unsupported_entry" ]; then
        echo "staged $component archive contains an unsupported filesystem entry" >&2
        exit 1
      fi
      while IFS= read -r database_record || [ -n "$database_record" ]; do
        [ -n "$database_record" ] || continue
        relative_path="$database_record"
        expected_size=""
        if [ "$component" = "photos" ]; then
          case "$database_record" in
            *"|"*)
              relative_path="${database_record%%|*}"
              expected_size="${database_record#*|}"
              ;;
            *) echo "invalid photo reference record: $database_record" >&2; exit 1 ;;
          esac
        fi
        case "$relative_path" in
          /*|*\\*|../*|*/../*|*/..|./*|*/./*|*/.)
            echo "unsafe $component database path: $relative_path" >&2
            exit 1
            ;;
        esac
        if [ "$component" = "photos" ]; then
          case "$relative_path" in
            */*)
              path_directory="${relative_path%%/*}"
              path_filename="${relative_path#*/}"
              case "$path_directory:$path_filename" in
                :*|*:|*:*/*) echo "non-canonical photo database path: $relative_path" >&2; exit 1 ;;
              esac
              ;;
            *) echo "non-canonical photo database path: $relative_path" >&2; exit 1 ;;
          esac
        fi
        if [ "$component" = "avatars" ]; then
          case "$relative_path" in
            */*) echo "unsafe avatar database path: $relative_path" >&2; exit 1 ;;
          esac
        fi
        if [ ! -f "/restore-media/$relative_path" ] || [ ! -r "/restore-media/$relative_path" ]; then
          echo "missing or unreadable $component file referenced by the database: $relative_path" >&2
          exit 1
        fi
        if [ -n "$expected_size" ]; then
          case "$expected_size" in
            *[!0-9]*) echo "invalid database size for $relative_path" >&2; exit 1 ;;
          esac
          actual_size="$(wc -c < "/restore-media/$relative_path")"
          if [ "$actual_size" -ne "$expected_size" ]; then
            echo "size mismatch for $component file $relative_path: expected $expected_size, got $actual_size" >&2
            exit 1
          fi
        fi
      done < "/restore-metadata/$expected_file"
      media_stats="$(python -c "from pathlib import Path; files=[item for item in Path(\"/restore-media\").rglob(\"*\") if item.is_file()]; print(len(files), sum(item.stat().st_size for item in files))")"
      echo "[restore] Validated $component staging: $media_stats (files bytes)."
    ' sh "$component" "$expected_file"
}

validate_database_media() {
  database_name="$1"
  photos_volume="$2"
  avatars_volume="$3"
  metadata_directory="$temporary_directory/metadata"
  rm -rf "$metadata_directory"
  mkdir -p "$metadata_directory"
  write_database_media_references "$database_name" "$metadata_directory"
  validate_media_volume photos "$photos_volume" metadata/photos.expected
  validate_media_volume avatars "$avatars_volume" metadata/avatars.expected
}

validate_s3_database_media() {
  database_name="$1"
  manifest_path="$2"
  metadata_directory="$temporary_directory/metadata"
  rm -rf "$metadata_directory"
  mkdir -p "$metadata_directory"
  write_database_media_references "$database_name" "$metadata_directory"
  s3_tool validate-references \
    --manifest "$manifest_path" \
    --references recovery-work/metadata/photos.expected
  validate_media_volume avatars "$avatars_stage_volume" metadata/avatars.expected
}

validate_live_media_component() {
  component="$1"
  live_path="$2"
  expected_file="$3"

  compose run --rm --no-deps -T \
    -v "$(bind_source "$temporary_directory"):/restore-metadata:ro" \
    --entrypoint sh cartavault -c '
      set -eu
      component="$1"
      live_path="$2"
      expected_file="$3"
      symbolic_link="$(find "$live_path" -type l -print -quit)"
      if [ -n "$symbolic_link" ]; then
        echo "live $component storage contains a symbolic link" >&2
        exit 1
      fi
      while IFS= read -r database_record || [ -n "$database_record" ]; do
        [ -n "$database_record" ] || continue
        relative_path="$database_record"
        expected_size=""
        if [ "$component" = "photos" ]; then
          case "$database_record" in
            *"|"*)
              relative_path="${database_record%%|*}"
              expected_size="${database_record#*|}"
              ;;
            *) echo "invalid photo reference record: $database_record" >&2; exit 1 ;;
          esac
        fi
        case "$relative_path" in
          /*|*\\*|../*|*/../*|*/..|./*|*/./*|*/.)
            echo "unsafe $component database path: $relative_path" >&2
            exit 1
            ;;
        esac
        if [ "$component" = "photos" ]; then
          case "$relative_path" in
            */*)
              path_directory="${relative_path%%/*}"
              path_filename="${relative_path#*/}"
              case "$path_directory:$path_filename" in
                :*|*:|*:*/*) echo "non-canonical photo database path: $relative_path" >&2; exit 1 ;;
              esac
              ;;
            *) echo "non-canonical photo database path: $relative_path" >&2; exit 1 ;;
          esac
        fi
        if [ "$component" = "avatars" ]; then
          case "$relative_path" in
            */*) echo "unsafe avatar database path: $relative_path" >&2; exit 1 ;;
          esac
        fi
        if [ ! -f "$live_path/$relative_path" ] || [ ! -r "$live_path/$relative_path" ]; then
          echo "missing or unreadable live $component file referenced by the database: $relative_path" >&2
          exit 1
        fi
        if [ -n "$expected_size" ]; then
          case "$expected_size" in
            *[!0-9]*) echo "invalid database size for $relative_path" >&2; exit 1 ;;
          esac
          actual_size="$(wc -c < "$live_path/$relative_path")"
          if [ "$actual_size" -ne "$expected_size" ]; then
            echo "size mismatch for live $component file $relative_path: expected $expected_size, got $actual_size" >&2
            exit 1
          fi
        fi
      done < "/restore-metadata/$expected_file"
    ' sh "$component" "$live_path" "$expected_file"
}

validate_live_database_media() {
  database_name="$1"
  metadata_directory="$temporary_directory/metadata"
  rm -rf "$metadata_directory"
  mkdir -p "$metadata_directory"
  write_database_media_references "$database_name" "$metadata_directory"
  validate_live_media_component photos /app/storage/photos metadata/photos.expected
  validate_live_media_component avatars /app/storage/avatars metadata/avatars.expected
}

validate_live_s3_database_media() {
  database_name="$1"
  manifest_path="$2"
  metadata_directory="$temporary_directory/metadata"
  rm -rf "$metadata_directory"
  mkdir -p "$metadata_directory"
  write_database_media_references "$database_name" "$metadata_directory"
  s3_tool validate-live --manifest "$manifest_path"
  s3_tool validate-references \
    --manifest "$manifest_path" \
    --references recovery-work/metadata/photos.expected
  validate_live_media_component avatars /app/storage/avatars metadata/avatars.expected
}

validate_archive() {
  archive_name="$1"
  compose run --rm --no-deps -T \
    -v "$(bind_source "$backup_directory"):/backup:ro" \
    --entrypoint sh cartavault \
    -c 'set -eu; tar -tzf "/backup/$1" >/dev/null' sh "$archive_name"
}

create_restore_volume() {
  volume_name="$1"
  docker volume create \
    --label com.cartavault.restore.id="$restore_id" \
    --label com.cartavault.restore.database="$live_database" \
    "$volume_name" >/dev/null 9>&-
}

extract_archive() {
  archive_name="$1"
  volume_name="$2"
  compose run --rm --no-deps -T --user 0:0 \
    --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    -v "$(bind_source "$backup_directory"):/backup:ro" \
    -v "$volume_name:/restore-stage" \
    --entrypoint sh cartavault \
    -c 'set -eu; find /restore-stage -mindepth 1 -delete; python -c "import tarfile; archive=tarfile.open('\''/backup/$1'\'', '\''r:gz'\''); archive.extractall('\''/restore-stage'\'', filter='\''data'\''); archive.close()"; chown -R cartavault:cartavault /restore-stage' \
    sh "$archive_name"
}

initialize_empty_volume() {
  volume_name="$1"
  compose run --rm --no-deps -T --user 0:0 \
    --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    -v "$volume_name:/restore-stage" \
    --entrypoint sh cartavault \
    -c 'set -eu; find /restore-stage -mindepth 1 -delete; chown cartavault:cartavault /restore-stage'
}

copy_live_to_previous() {
  component="$1"
  previous_volume="$2"
  case "$component" in
    photos) live_path=/app/storage/photos ;;
    avatars) live_path=/app/storage/avatars ;;
    exports) live_path=/app/storage/exports ;;
    *) error "unknown media component: $component"; return 1 ;;
  esac
  compose run --rm --no-deps -T --user 0:0 \
    --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    -v "$previous_volume:/restore-previous" \
    --entrypoint sh cartavault -c '
      set -eu
      live_path="$1"
      find /restore-previous -mindepth 1 -delete
      cp -a "$live_path/." /restore-previous/
    ' sh "$live_path"
}

copy_volume_to_live() {
  component="$1"
  source_volume="$2"
  case "$component" in
    photos) live_path=/app/storage/photos ;;
    avatars) live_path=/app/storage/avatars ;;
    exports) live_path=/app/storage/exports ;;
    *) error "unknown media component: $component"; return 1 ;;
  esac
  compose run --rm --no-deps -T --user 0:0 \
    --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    -v "$source_volume:/restore-source:ro" \
    --entrypoint sh cartavault -c '
      set -eu
      live_path="$1"
      find "$live_path" -mindepth 1 -delete
      cp -a /restore-source/. "$live_path/"
    ' sh "$live_path"
}

wait_for_readiness() {
  elapsed=0
  while [ "$elapsed" -lt "$ready_timeout" ]; do
    if compose exec -T cartavault python -c \
      "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health/ready', timeout=3)" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2 9>&-
    elapsed=$((elapsed + 2))
  done
  error "CartaVault readiness did not succeed within ${ready_timeout}s."
  return 1
}

inject_failure() {
  phase="$1"
  if [ "${CARTAVAULT_RESTORE_TESTING:-false}" != "true" ]; then
    return 0
  fi
  if [ "${CARTAVAULT_RESTORE_TEST_PAUSE_AT:-}" = "$phase" ]; then
    pause_seconds="${CARTAVAULT_RESTORE_TEST_PAUSE_SECONDS:-300}"
    log "[restore:test] Pausing at $phase for ${pause_seconds}s."
    while [ "$pause_seconds" -gt 0 ]; do
      sleep 1 9>&-
      pause_seconds=$((pause_seconds - 1))
    done
  fi
  if [ "${CARTAVAULT_RESTORE_TEST_FAIL_AT:-}" = "$phase" ]; then
    error "injected test failure at $phase."
    return 97
  fi
}

remove_restore_volumes() {
  volume_cleanup_failed=0
  for volume_name in \
    "$photos_stage_volume" "$avatars_stage_volume" "$exports_stage_volume" \
    "$photos_previous_volume" "$avatars_previous_volume" "$exports_previous_volume"; do
    if [ -n "$volume_name" ]; then
      if ! docker volume rm "$volume_name" >/dev/null 2>&1 9>&-; then
        volume_cleanup_failed=1
      fi
    fi
  done
  return "$volume_cleanup_failed"
}

cleanup_staging() {
  if [ -n "$stage_database" ]; then
    drop_database "$stage_database" >/dev/null 2>&1 || :
  fi
  remove_restore_volumes || :
  if [ "$storage_mode" = "s3" ]; then
    s3_tool cleanup --restore-id "$restore_id" >/dev/null 2>&1 || :
  fi
  rm -rf "$temporary_directory"
}

rollback_restore() {
  rollback_failed=0
  log "[rollback] Reacquiring the writer quiescence barrier before restoring the previous state."
  writer_quiesce_context=rollback
  if ! quiesce_writers; then
    rollback_failed=1
    error "rollback quiescence barrier failed: ${writer_quiesce_failure}. No rollback mutation was attempted."
    # The rollback barrier runs while writers are already stopped. Restore the
    # topology captured before cutover instead of the empty post-cutover state.
    writer_active_services="$restore_initial_writer_services"
    if ! resume_writers; then
      error "one or more writers could not be returned to their pre-barrier state. MANUAL RECOVERY REQUIRED."
    elif writer_was_active cartavault && ! wait_for_readiness; then
      error "CartaVault did not become ready after the rollback barrier failure. MANUAL RECOVERY REQUIRED."
    fi
    return 1
  fi

  if [ "$storage_mode" = "s3" ]; then
    if [ "$s3_previous_ready" -eq 1 ]; then
      log "[rollback] Restoring the previous S3 namespace."
      s3_tool rollback \
        --restore-id "$restore_id" \
        --manifest recovery-work/s3-previous-objects.jsonl || rollback_failed=1
    else
      error "previous S3 namespace is not ready. MANUAL RECOVERY REQUIRED."
      rollback_failed=1
    fi
  fi

  if [ "$previous_media_ready" -eq 1 ]; then
    log "[rollback] Restoring previous local media."
    if [ "$storage_mode" = "local" ]; then
      copy_volume_to_live photos "$photos_previous_volume" || rollback_failed=1
    fi
    copy_volume_to_live avatars "$avatars_previous_volume" || rollback_failed=1
    copy_volume_to_live exports "$exports_previous_volume" || rollback_failed=1
  fi

  if database_exists "$previous_database"; then
    log "[rollback] Restoring previous PostgreSQL database."
    database_rollback_failed=0
    terminate_database_connections "$live_database" || database_rollback_failed=1
    terminate_database_connections "$previous_database" || database_rollback_failed=1
    if [ "$database_rollback_failed" -eq 0 ] && database_exists "$live_database"; then
      rename_database "$live_database" "$failed_database" || database_rollback_failed=1
    fi
    if [ "$database_rollback_failed" -eq 0 ]; then
      rename_database "$previous_database" "$live_database" || database_rollback_failed=1
    fi
    if [ "$database_rollback_failed" -ne 0 ]; then
      rollback_failed=1
    fi
  else
    if database_exists "$stage_database" && database_exists "$live_database"; then
      log "[rollback] Database cutover had not changed the live database name."
    else
      error "previous database $previous_database was not found. MANUAL RECOVERY REQUIRED."
      rollback_failed=1
    fi
  fi

  if [ "$rollback_failed" -eq 0 ]; then
    # Restore the service topology that existed before this restore, not merely
    # the services that happened to be alive when rollback was entered.
    writer_active_services="$restore_initial_writer_services"
    log "[rollback] Starting the API on the previous state."
    resume_api_writer || rollback_failed=1
    if writer_was_active cartavault; then
      wait_for_readiness || rollback_failed=1
    fi
    if [ "$rollback_failed" -eq 0 ]; then
      resume_worker_writer || rollback_failed=1
    fi
    if [ "$rollback_failed" -eq 0 ]; then
      writer_quiesced=0
      writer_quiesce_attempted=0
    fi
    if [ "$storage_mode" = "s3" ]; then
      validate_database "$live_database" || rollback_failed=1
      validate_live_s3_database_media "$live_database" recovery-work/s3-previous-objects.jsonl || rollback_failed=1
    fi
  fi

  if [ "$rollback_failed" -ne 0 ]; then
    error "rollback failed. MANUAL RECOVERY REQUIRED. Staging and previous artifacts were preserved."
    return 1
  fi

  log "[rollback] Previous database and media restored; CartaVault is ready."
  drop_database "$failed_database" >/dev/null 2>&1 || warning "failed replacement database $failed_database was retained."
  drop_database "$stage_database" >/dev/null 2>&1 || :
  if [ "$storage_mode" = "s3" ]; then
    s3_tool cleanup --restore-id "$restore_id" >/dev/null 2>&1 || warning "rollback succeeded, but S3 restore artifacts were retained."
  fi
  if ! remove_restore_volumes; then
    warning "rollback succeeded, but one or more restore media volumes were retained."
  fi
  rm -rf "$temporary_directory"
  return 0
}

handle_exit() {
  status=$?
  trap - EXIT INT TERM
  set +e

  if [ "$status" -ne 0 ]; then
    if [ "$cutover_started" -eq 1 ]; then
      error "restore failed after cutover began; automatic rollback is starting."
      rollback_restore
      rollback_status=$?
      if [ "$rollback_status" -eq 0 ]; then
        error "restore failed, but rollback succeeded and the previous state is serving."
      fi
    else
      cleanup_staging
      if [ "$writer_quiesce_attempted" -eq 1 ]; then
        writers_recovered=1
        if ! resume_api_writer; then
          writers_recovered=0
        elif writer_was_active cartavault && ! wait_for_readiness; then
          writers_recovered=0
        fi
        if ! resume_worker_writer; then
          writers_recovered=0
        fi
        if [ "$writers_recovered" -ne 1 ]; then
          error "the live data was not changed, but one or more writers did not recover. MANUAL RECOVERY REQUIRED."
        else
          writer_quiesce_attempted=0
          writer_quiesced=0
        fi
      fi
      error "restore failed before cutover; the live database and media were not changed."
    fi
  fi

  release_operation_lock
  exit "$status"
}

handle_signal() {
  signal_name="$1"
  error "received $signal_name."
  case "$signal_name" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}

trap handle_exit EXIT
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM

if [ -z "$backup_directory" ] || [ ! -d "$backup_directory" ]; then
  echo "Usage: CARTAVAULT_RESTORE_CONFIRM=restore $0 /absolute/backup/directory" >&2
  exit 2
fi
case "$backup_directory" in
  /*) ;;
  *) error "backup directory must be an absolute path."; exit 2 ;;
esac
if [ "${CARTAVAULT_RESTORE_CONFIRM:-}" != "restore" ]; then
  error "restore refused. Set CARTAVAULT_RESTORE_CONFIRM=restore explicitly."
  exit 2
fi
case "$ready_timeout" in
  ''|*[!0-9]*|0) error "CARTAVAULT_RESTORE_READY_TIMEOUT_SECONDS must be a positive integer."; exit 2 ;;
esac

operation_allow_undeployed_compose=1
resolve_authoritative_compose
acquire_operation_lock
mkdir -p "$temporary_directory"

log "[1/10] Preflight: checking deployment and backup structure."
storage_mode="$(compose run --rm --no-deps -T --entrypoint sh cartavault -c 'printf "%s" "${MEDIA_STORAGE:-local}"')"
if [ "$storage_mode" != "local" ] && [ "$storage_mode" != "s3" ]; then
  error "unsupported MEDIA_STORAGE value. No changes were applied."
  exit 4
fi

for required_file in database.dump avatars.tar.gz SHA256SUMS; do
  if [ ! -f "$backup_directory/$required_file" ]; then
    error "required backup artifact is missing: $required_file. No changes were applied."
    exit 2
  fi
done
if [ "$storage_mode" = "local" ] && [ ! -f "$backup_directory/photos.tar.gz" ]; then
  error "required backup artifact is missing: photos.tar.gz. No changes were applied."
  exit 2
fi

exports_included=false
format_version="legacy"
manifest_storage="local"
manifest_completed=""
s3_bucket=""
s3_prefix=""
s3_object_count=""
s3_total_bytes=""
manifest_value() {
  manifest_key="$1"
  manifest_matches="$(sed -n "s/^${manifest_key}=//p" "$backup_directory/manifest.txt")"
  manifest_match_count="$(grep -c "^${manifest_key}=" "$backup_directory/manifest.txt" || :)"
  if [ "$manifest_match_count" -gt 1 ]; then
    error "manifest field is duplicated: $manifest_key. No changes were applied."
    exit 2
  fi
  printf '%s' "$manifest_matches"
}
if [ -f "$backup_directory/manifest.txt" ]; then
  manifest_created_at="$(manifest_value created_at)"
  manifest_version="$(manifest_value cartavault_version)"
  database_format="$(manifest_value database_format)"
  manifest_exports="$(manifest_value exports_included)"
  parsed_format_version="$(manifest_value format_version)"
  parsed_storage_backend="$(manifest_value storage_backend)"
  manifest_completed="$(manifest_value completed)"
  if [ -n "$parsed_format_version" ]; then
    format_version="$parsed_format_version"
  fi
  if [ -n "$parsed_storage_backend" ]; then
    manifest_storage="$parsed_storage_backend"
  fi
  if [ -z "$manifest_created_at" ] || [ -z "$manifest_version" ]; then
    error "manifest created_at and cartavault_version must be present. No changes were applied."
    exit 2
  fi
  if [ "$database_format" != "postgresql-custom" ]; then
    error "manifest database_format must be postgresql-custom. No changes were applied."
    exit 2
  fi
  case "$manifest_exports" in
    true) exports_included=true ;;
    false) exports_included=false ;;
    *) error "manifest exports_included must be true or false. No changes were applied."; exit 2 ;;
  esac
  if [ "$exports_included" = true ] && [ ! -f "$backup_directory/exports.tar.gz" ]; then
    error "manifest requires exports.tar.gz, but the archive is missing. No changes were applied."
    exit 2
  fi
  if [ "$format_version" != "legacy" ] && [ "$format_version" != "2" ]; then
    error "unsupported backup format_version: $format_version. No changes were applied."
    exit 2
  fi
  if [ "$format_version" = "2" ]; then
    if [ "$manifest_completed" != "true" ] || [ ! -f "$backup_directory/COMPLETED" ] || [ "$(cat "$backup_directory/COMPLETED")" != "cartavault-backup-v2" ]; then
      error "backup format 2 is incomplete: completed manifest state/COMPLETED marker is missing or invalid. No changes were applied."
      exit 2
    fi
  fi
else
  warning "legacy backup has no manifest.txt; required artifacts will be validated using the legacy contract."
fi
if [ -f "$backup_directory/exports.tar.gz" ]; then
  exports_included=true
fi

if [ "$manifest_storage" != "$storage_mode" ]; then
  error "backup storage_backend=$manifest_storage does not match live MEDIA_STORAGE=$storage_mode. No changes were applied."
  exit 4
fi
if [ "$storage_mode" = "s3" ]; then
  if [ "$format_version" != "2" ]; then
    error "legacy/DB-only backups are refused for S3 restore because they contain no verified S3 recovery set. No changes were applied."
    exit 4
  fi
  s3_bucket="$(manifest_value s3_bucket)"
  s3_prefix="$(manifest_value s3_prefix)"
  s3_object_count="$(manifest_value s3_object_count)"
  s3_total_bytes="$(manifest_value s3_total_bytes)"
  s3_recovery_artifact="$(manifest_value s3_recovery_artifact)"
  s3_object_manifest="$(manifest_value s3_object_manifest)"
  s3_captured_at="$(manifest_value s3_captured_at)"
  if [ -z "$s3_bucket" ] || [ -z "$s3_prefix" ] || [ -z "$s3_captured_at" ]; then
    error "S3 manifest bucket, prefix, and capture timestamp are required. No changes were applied."
    exit 2
  fi
  case "$s3_object_count" in ''|*[!0-9]*) error "S3 manifest object count must be a non-negative integer. No changes were applied."; exit 2 ;; esac
  case "$s3_total_bytes" in ''|*[!0-9]*) error "S3 manifest byte count must be a non-negative integer. No changes were applied."; exit 2 ;; esac
  if [ "$s3_recovery_artifact" != "s3-objects.tar.gz" ] || [ "$s3_object_manifest" != "s3-objects.jsonl" ]; then
    error "unsupported S3 recovery artifact names. No changes were applied."
    exit 2
  fi
  for required_file in s3-objects.tar.gz s3-objects.jsonl s3-database-references.tsv; do
    if [ ! -f "$backup_directory/$required_file" ]; then
      error "required S3 backup artifact is missing: $required_file. No changes were applied."
      exit 2
    fi
  done
fi

normalized_checksums="$temporary_directory/SHA256SUMS.normalized"
awk \
  -v exports_required="$(if [ "$exports_included" = true ]; then printf 1; else printf 0; fi)" \
  -v photos_required="$(if [ "$storage_mode" = local ]; then printf 1; else printf 0; fi)" \
  -v s3_required="$(if [ "$storage_mode" = s3 ]; then printf 1; else printf 0; fi)" '
  BEGIN { failed = 0 }
  NF != 2 || $1 !~ /^[0-9A-Fa-f]{64}$/ { failed = 1; next }
  {
    path = $2
    sub(/^\*/, "", path)
    gsub(/\\/, "/", path)
    count = split(path, parts, "/")
    file = parts[count]
    if (file != "database.dump" && file != "photos.tar.gz" && file != "avatars.tar.gz" && file != "exports.tar.gz" && file != "manifest.txt" && file != "s3-objects.tar.gz" && file != "s3-objects.jsonl" && file != "s3-database-references.tsv") {
      failed = 1
      next
    }
    if (seen[file]++) {
      failed = 1
      next
    }
    print tolower($1) "  " file
  }
  END {
    if (!seen["database.dump"] || !seen["avatars.tar.gz"] || (photos_required && !seen["photos.tar.gz"]) || (exports_required && !seen["exports.tar.gz"]) || (s3_required && (!seen["s3-objects.tar.gz"] || !seen["s3-objects.jsonl"] || !seen["s3-database-references.tsv"] || !seen["manifest.txt"]))) {
      failed = 1
    }
    if (failed) exit 1
  }
' "$backup_directory/SHA256SUMS" > "$normalized_checksums" || {
  error "SHA256SUMS is malformed, incomplete, duplicated, or contains unsupported paths. No changes were applied."
  exit 2
}
(unset CDPATH; cd -- "$backup_directory" && sha256sum -c "$normalized_checksums") 9>&-
if [ "$format_version" = "2" ] && ! grep -q '  manifest.txt$' "$normalized_checksums"; then
  error "backup format 2 manifest.txt must be covered by SHA256SUMS. No changes were applied."
  exit 2
fi
if [ -f "$backup_directory/manifest.txt" ] && ! grep -q '  manifest.txt$' "$normalized_checksums"; then
  warning "legacy manifest.txt is not covered by SHA256SUMS; its fields were validated structurally."
fi

compose exec -T postgis sh -c 'set -eu; temporary_dump="$(mktemp)"; trap '\''rm -f "$temporary_dump"'\'' EXIT; cat > "$temporary_dump"; pg_restore --list "$temporary_dump" >/dev/null' \
  < "$backup_directory/database.dump"
if [ "$storage_mode" = "s3" ]; then
  s3_preflight_stats="$(s3_tool preflight \
    --archive recovery-backup/s3-objects.tar.gz \
    --manifest recovery-backup/s3-objects.jsonl \
    --expected-bucket "$s3_bucket" \
    --expected-prefix "$s3_prefix")"
  preflight_object_count="$(printf '%s' "$s3_preflight_stats" | sed -n 's/^objects=\([0-9][0-9]*\) bytes=[0-9][0-9]*$/\1/p')"
  preflight_total_bytes="$(printf '%s' "$s3_preflight_stats" | sed -n 's/^objects=[0-9][0-9]* bytes=\([0-9][0-9]*\)$/\1/p')"
  if [ "$preflight_object_count" != "$s3_object_count" ] || [ "$preflight_total_bytes" != "$s3_total_bytes" ]; then
    error "S3 object manifest statistics differ from manifest.txt. No changes were applied."
    exit 2
  fi
else
  validate_archive photos.tar.gz
fi
validate_archive avatars.tar.gz
if [ "$exports_included" = true ]; then
  validate_archive exports.tar.gz
fi

live_database="$(compose exec -T postgis sh -c 'printf "%s" "$POSTGRES_DB"')"
case "$live_database" in
  ''|*[!A-Za-z0-9_]*) error "POSTGRES_DB must contain only letters, digits, and underscores for safe database cutover."; exit 2 ;;
esac
database_prefix="cvrs_$(printf '%.18s' "$live_database")_"
stage_database="${database_prefix}s_$restore_id"
previous_database="${database_prefix}p_$restore_id"
failed_database="${database_prefix}f_$restore_id"
stage_database="$(printf '%.63s' "$stage_database")"
previous_database="$(printf '%.63s' "$previous_database")"
failed_database="$(printf '%.63s' "$failed_database")"

existing_restore_databases="$(compose exec -T postgis sh -c 'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT datname FROM pg_database ORDER BY datname"')"
for existing_database in $existing_restore_databases; do
  case "$existing_database" in
    "$database_prefix"*)
      error "leftover restore database detected: $existing_database. MANUAL RECOVERY REQUIRED; no changes were applied."
      exit 5
      ;;
  esac
done
existing_restore_volumes="$(docker volume ls --filter "label=com.cartavault.restore.database=$live_database" --format '{{.Name}}' 9>&-)"
if [ -n "$existing_restore_volumes" ]; then
  error "leftover restore media volumes detected. MANUAL RECOVERY REQUIRED; no changes were applied."
  printf '%s\n' "$existing_restore_volumes" >&2
  exit 5
fi

volume_prefix="cvrestore_${restore_id}"
avatars_stage_volume="${volume_prefix}_avatars_stage"
exports_stage_volume="${volume_prefix}_exports_stage"
avatars_previous_volume="${volume_prefix}_avatars_previous"
exports_previous_volume="${volume_prefix}_exports_previous"
if [ "$storage_mode" = "local" ]; then
  photos_stage_volume="${volume_prefix}_photos_stage"
  photos_previous_volume="${volume_prefix}_photos_previous"
fi

log "[restore] Staging requires a second database plus staging and previous media copies."
compose run --rm --no-deps -T --entrypoint sh cartavault -c \
  'df -Pk /app/storage/avatars /app/storage/exports'

log "[2/10] Stage database: restoring into $stage_database while the live service remains available."
compose exec -T postgis sh -c \
  'createdb -U "$POSTGRES_USER" --template=template0 "$1"' sh "$stage_database"
inject_failure database_created
compose exec -T postgis sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error' sh "$stage_database" \
  < "$backup_directory/database.dump"
inject_failure database_staged

log "[3/10] Validate database: checking schema and basic queries."
validate_database "$stage_database"

log "[4/10] Stage media: extracting into isolated Docker volumes."
for volume_name in \
  "$photos_stage_volume" "$avatars_stage_volume" "$exports_stage_volume" \
  "$photos_previous_volume" "$avatars_previous_volume" "$exports_previous_volume"; do
  if [ -n "$volume_name" ]; then
    create_restore_volume "$volume_name"
  fi
done
if [ "$storage_mode" = "local" ]; then
  extract_archive photos.tar.gz "$photos_stage_volume"
  inject_failure photos_staged
else
  log "[restore] Uploading and validating the recovery set in an isolated S3 staging namespace."
  s3_tool stage \
    --restore-id "$restore_id" \
    --archive recovery-backup/s3-objects.tar.gz \
    --manifest recovery-backup/s3-objects.jsonl \
    --work-directory recovery-work/s3-upload
  inject_failure s3_staged
fi
extract_archive avatars.tar.gz "$avatars_stage_volume"
if [ "$exports_included" = true ]; then
  extract_archive exports.tar.gz "$exports_stage_volume"
else
  initialize_empty_volume "$exports_stage_volume"
fi

log "[5/10] Validate media: checking extracted files and database references."
if [ "$storage_mode" = "local" ]; then
  validate_database_media "$stage_database" "$photos_stage_volume" "$avatars_stage_volume"
else
  validate_s3_database_media "$stage_database" recovery-backup/s3-objects.jsonl
fi
inject_failure staging_validated

log "[6/10] Quiesce all writers: beginning the short cutover window."
cutover_started_at="$(date +%s)"
writer_quiesce_context=cutover
if ! quiesce_writers; then
  error "initial cutover quiescence barrier failed: ${writer_quiesce_failure}. No live state was changed."
  exit 1
fi
restore_initial_writer_services="$writer_active_services"

log "[restore] Preserving current media for rollback."
if [ "$storage_mode" = "local" ]; then
  copy_live_to_previous photos "$photos_previous_volume"
else
  s3_tool snapshot-live \
    --restore-id "$restore_id" \
    --output-manifest recovery-work/s3-previous-objects.jsonl
  s3_previous_ready=1
fi
copy_live_to_previous avatars "$avatars_previous_volume"
copy_live_to_previous exports "$exports_previous_volume"
previous_media_ready=1
inject_failure previous_media_saved

log "[7/10] Cutover: swapping database, then authoritative media while CartaVault is stopped."
cutover_started=1
terminate_database_connections "$live_database"
terminate_database_connections "$stage_database"
rename_database "$live_database" "$previous_database"
rename_database "$stage_database" "$live_database"
inject_failure database_cutover

if [ "$storage_mode" = "local" ]; then
  copy_volume_to_live photos "$photos_stage_volume"
  inject_failure photos_cutover
else
  s3_tool cutover \
    --restore-id "$restore_id" \
    --manifest recovery-backup/s3-objects.jsonl
  inject_failure s3_cutover
fi
copy_volume_to_live avatars "$avatars_stage_volume"
inject_failure avatars_cutover
copy_volume_to_live exports "$exports_stage_volume"
inject_failure media_cutover

log "[8/10] Start application: migrations run through the version-matched container entrypoint."
if [ "$deployment_present" -eq 0 ]; then
  writer_active_services="cartavault
"
  if writer_is_configured worker; then
    writer_active_services="${writer_active_services}worker
"
  fi
fi
resume_api_writer
wait_for_readiness
resume_worker_writer
writer_quiesced=0
writer_quiesce_attempted=0
inject_failure readiness

log "[9/10] Post-validate: waiting for readiness and rechecking live database/media."
wait_for_readiness
service_ready_at="$(date +%s)"
validate_database "$live_database"
if [ "$storage_mode" = "local" ]; then
  validate_live_database_media "$live_database"
else
  validate_live_s3_database_media "$live_database" recovery-backup/s3-objects.jsonl
fi
log "[10/10] Cleanup: replacement is valid; removing staging and previous copies."
cutover_started=0
if ! drop_database "$previous_database" >/dev/null 2>&1; then
  warning "restore succeeded, but previous database $previous_database could not be removed."
fi
if ! remove_restore_volumes; then
  warning "restore succeeded, but one or more staging/previous media volumes were retained."
fi
if [ "$storage_mode" = "s3" ]; then
  if ! s3_tool cleanup --restore-id "$restore_id"; then
    warning "restore succeeded, but S3 staging/previous artifacts were retained."
  fi
fi
rm -rf "$temporary_directory"

log "[restore] Completed safely. CartaVault is ready on the validated replacement state."
restore_finished_at="$(date +%s)"
log "[restore] Observed timing: staging=$((cutover_started_at - restore_started_at))s service_downtime=$((service_ready_at - cutover_started_at))s total=$((restore_finished_at - restore_started_at))s."
compose ps
