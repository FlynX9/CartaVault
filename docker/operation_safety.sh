#!/usr/bin/env sh
# Authoritative Compose resolution and shared backup/restore serialization.
# The caller must define compose(), compose_file, compose_extra_file, and
# compose_project before sourcing this file.
# shellcheck disable=SC2016

operation_lock_owned=0

operation_error() {
  printf 'ERROR: %s\n' "$*" >&2
}

resolve_authoritative_compose() {
  selected_compose_file="$compose_file"
  selected_compose_extra_file="$compose_extra_file"
  deployment_present=1
  explicit_compose_fallback=0
  api_ids="$(compose ps --all -q cartavault 2>/dev/null || :)"
  api_count="$(printf '%s\n' "$api_ids" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$api_count" -eq 0 ] && [ "${operation_allow_undeployed_compose:-0}" -eq 1 ]; then
    deployment_present=0
    if [ ! -f "$compose_file" ] || { [ -n "$compose_extra_file" ] && [ ! -f "$compose_extra_file" ]; }; then
      operation_error "the explicit Compose file set is unavailable for undeployed restore bootstrap"
      return 1
    fi
    if [ -z "$compose_project" ]; then
      compose_project="$(compose config | sed -n 's/^name: //p' | sed -n '1p')"
    fi
    if [ -z "$compose_project" ]; then
      operation_error "the Compose project cannot be determined for undeployed restore bootstrap"
      return 1
    fi
  elif [ "$api_count" -ne 1 ]; then
    operation_error "exactly one deployed cartavault service must be discoverable from the selected Compose project"
    return 1
  fi

  if [ "$deployment_present" -eq 1 ]; then
    api_id="$(printf '%s\n' "$api_ids" | sed -n '1p')"
    deployed_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$api_id")" || return 1
    deployed_files="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$api_id")" || return 1
    if [ "${CARTAVAULT_OPERATION_TESTING:-false}" = true ] && [ -n "${CARTAVAULT_OPERATION_TEST_DEPLOYED_FILES:-}" ]; then
      deployed_files="$CARTAVAULT_OPERATION_TEST_DEPLOYED_FILES"
    fi
    if [ -z "$deployed_project" ] || [ "$deployed_project" = '<no value>' ]; then
      operation_error "the deployed Compose project label is unavailable; writer coverage cannot be proven"
      return 1
    fi

    compose_project="$deployed_project"
    case "$deployed_files" in
      *,*)
        deployed_compose_file="${deployed_files%%,*}"
        deployed_compose_extra_file="${deployed_files#*,}"
        case "$deployed_compose_extra_file" in
          *,*) operation_error "more than two deployed Compose files are not supported by backup/restore"; return 1 ;;
        esac
        ;;
      *)
        deployed_compose_file="$deployed_files"
        deployed_compose_extra_file=""
        ;;
    esac
    if [ -n "$deployed_files" ] && [ "$deployed_files" != '<no value>' ] \
      && [ -f "$deployed_compose_file" ] \
      && { [ -z "$deployed_compose_extra_file" ] || [ -f "$deployed_compose_extra_file" ]; }; then
      compose_file="$deployed_compose_file"
      compose_extra_file="$deployed_compose_extra_file"
    elif [ -f "$selected_compose_file" ] \
      && { [ -z "$selected_compose_extra_file" ] || [ -f "$selected_compose_extra_file" ]; }; then
      # Portainer's labels can name files in Portainer's container namespace.
      # Deployment task-mode and worker checks below still prove equivalence.
      compose_file="$selected_compose_file"
      compose_extra_file="$selected_compose_extra_file"
      explicit_compose_fallback=1
    else
      operation_error "neither deployed nor explicit Compose files are available on this host"
      return 1
    fi
  fi

  configured_services="$(compose config --services)" || {
    operation_error "the deployed Compose file set cannot be resolved"
    return 1
  }
  if ! printf '%s\n' "$configured_services" | grep -Fx cartavault >/dev/null 2>&1; then
    operation_error "the deployed Compose file set does not contain cartavault"
    return 1
  fi

  worker_configured=0
  if printf '%s\n' "$configured_services" | grep -Fx worker >/dev/null 2>&1; then
    worker_configured=1
  fi
  if [ "$deployment_present" -eq 1 ]; then
    task_mode="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$api_id" | sed -n 's/^CARTAVAULT_TASK_MODE=//p' | tail -n 1)"
    worker_ids="$(docker ps -aq \
      --filter "label=com.docker.compose.project=$compose_project" \
      --filter 'label=com.docker.compose.service=worker')"
  elif [ "$worker_configured" -eq 1 ]; then
    task_mode=redis
    worker_ids=bootstrap
  else
    task_mode=sync
    worker_ids=""
  fi

  if [ "$task_mode" = redis ]; then
    if [ "$worker_configured" -ne 1 ] || [ -z "$worker_ids" ]; then
      operation_error "Redis task mode is active but the deployed worker cannot be proven; refusing an incomplete writer barrier"
      return 1
    fi
  elif [ "$worker_configured" -eq 1 ] || [ -n "$worker_ids" ]; then
    operation_error "worker deployment and CARTAVAULT_TASK_MODE disagree; refusing an ambiguous writer barrier"
    return 1
  fi

  if ! printf '%s\n' "$configured_services" | grep -Fx postgis >/dev/null 2>&1; then
    operation_error "this backup/restore workflow requires the Compose-managed postgis service"
    return 1
  fi
  if [ "$explicit_compose_fallback" -eq 1 ]; then
    deployed_config_hash="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.config-hash" }}' "$api_id")" || return 1
    selected_config_hash="$(compose config --hash cartavault | awk '$1 == "cartavault" { print $2 }')" || return 1
    if [ -z "$deployed_config_hash" ] || [ "$deployed_config_hash" = '<no value>' ] \
      || [ "$selected_config_hash" != "$deployed_config_hash" ]; then
      operation_error "the explicit Compose configuration does not match the deployed cartavault service"
      return 1
    fi
    if [ "$task_mode" = redis ]; then
      selected_worker_hash="$(compose config --hash worker | awk '$1 == "worker" { print $2 }')" || return 1
      for worker_id in $worker_ids; do
        deployed_worker_hash="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.config-hash" }}' "$worker_id")" || return 1
        if [ -z "$deployed_worker_hash" ] || [ "$deployed_worker_hash" = '<no value>' ] \
          || [ "$selected_worker_hash" != "$deployed_worker_hash" ]; then
          operation_error "the explicit Compose configuration does not match the deployed worker service"
          return 1
        fi
      done
    fi
  fi
  return 0
}

verify_no_restore_leftovers() {
  live_database="$(compose exec -T postgis sh -c 'printf "%s" "$POSTGRES_DB"')" || return 1
  case "$live_database" in
    ''|*[!A-Za-z0-9_]*) operation_error "POSTGRES_DB is unsafe for restore-artifact detection"; return 1 ;;
  esac
  database_prefix="cvrs_$(printf '%.18s' "$live_database")_"
  existing_databases="$(compose exec -T postgis sh -c \
    'psql -U "$POSTGRES_USER" -d postgres -Atc "SELECT datname FROM pg_database WHERE left(datname, length('\''$1'\'')) = '\''$1'\'' ORDER BY datname"' \
    sh "$database_prefix")" || return 1
  existing_volumes="$(docker volume ls --filter "label=com.cartavault.restore.database=$live_database" --format '{{.Name}}' 9>&-)" || return 1
  if [ -n "$existing_databases" ] || [ -n "$existing_volumes" ]; then
    operation_error "leftover restore database/media artifacts require manual recovery before backup"
    [ -z "$existing_databases" ] || printf '%s\n' "$existing_databases" >&2
    [ -z "$existing_volumes" ] || printf '%s\n' "$existing_volumes" >&2
    return 1
  fi
  return 0
}

acquire_operation_lock() {
  if ! command -v flock >/dev/null 2>&1; then
    operation_error "flock is required for mandatory backup/restore serialization"
    return 1
  fi
  lock_root="${CARTAVAULT_OPERATION_LOCK_ROOT:-/tmp/cartavault-operation-locks}"
  lock_key="$(printf '%s' "$compose_project" | tr -c 'A-Za-z0-9_.-' '_')"
  mkdir -p "$lock_root" || return 1
  chmod 700 "$lock_root" 2>/dev/null || :
  operation_lock_path="$lock_root/$lock_key.lock"
  exec 9>"$operation_lock_path"
  if ! flock -n 9; then
    operation_error "another CartaVault backup/restore operation already owns $compose_project; no protected action was started"
    exec 9>&-
    return 1
  fi
  operation_lock_owned=1
  return 0
}

release_operation_lock() {
  if [ "$operation_lock_owned" -eq 1 ]; then
    flock -u 9 || :
    exec 9>&-
    operation_lock_owned=0
  fi
}
