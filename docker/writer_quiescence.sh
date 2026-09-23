#!/usr/bin/env sh
# Shared writer discovery and quiescence barrier for backup/restore scripts.
# The caller must define compose() before sourcing this file.
# shellcheck disable=SC2034

writer_quiesce_attempted=0
writer_quiesced=0
writer_active_services=""
writer_service_list=""
writer_quiesce_failure=""
writer_quiesce_context=""

writer_is_configured() {
  service="$1"
  case "$(printf '%s\n' "$writer_service_list" | grep -Fx "$service" || :)" in
    "$service") return 0 ;;
    *) return 1 ;;
  esac
}

writer_discover_services() {
  writer_service_list=""
  configured_services="$(compose config --services)" || {
    writer_quiesce_failure="unable to resolve Compose services"
    return 1
  }
  for service in cartavault worker; do
    if printf '%s\n' "$configured_services" | grep -Fx "$service" >/dev/null 2>&1; then
      writer_service_list="${writer_service_list}${service}
"
    fi
  done
  return 0
}

writer_service_states() {
  service="$1"
  if { [ "${CARTAVAULT_BACKUP_TESTING:-false}" = true ] || [ "${CARTAVAULT_RESTORE_TESTING:-false}" = true ]; } \
    && [ "${CARTAVAULT_QUIESCE_TEST_FAIL_INSPECT_SERVICE:-}" = "$service" ]; then
    return 1
  fi
  container_ids="$(compose ps -q "$service")" || return 1
  for container_id in $container_ids; do
    docker inspect --format '{{.State.Status}}' "$container_id" 9>&- || return 1
  done
}

writer_service_is_running() {
  service="$1"
  states="$(writer_service_states "$service")" || return 2
  for state in $states; do
    case "$state" in
      running|restarting|paused) return 0 ;;
    esac
  done
  return 1
}

writer_capture_active_services() {
  writer_active_services=""
  for service in cartavault worker; do
    if writer_is_configured "$service"; then
      if writer_service_is_running "$service"; then
        writer_active_services="${writer_active_services}${service}
"
      else
        writer_state_status=$?
        if [ "$writer_state_status" -ne 1 ]; then
          return 1
        fi
      fi
    fi
  done
}

writer_was_active() {
  service="$1"
  printf '%s\n' "$writer_active_services" | grep -Fx "$service" >/dev/null 2>&1
}

writer_verify_stopped() {
  for service in cartavault worker; do
    if writer_is_configured "$service"; then
      states="$(writer_service_states "$service")" || {
        writer_quiesce_failure="unable to inspect writer service $service"
        return 1
      }
      for state in $states; do
        case "$state" in
          running|restarting|paused)
            writer_quiesce_failure="writer service $service remains $state"
            return 1
            ;;
        esac
      done
    fi
  done
  return 0
}

writer_verify_service_stopped() {
  service="$1"
  states="$(writer_service_states "$service")" || {
    writer_quiesce_failure="unable to inspect writer service $service"
    return 1
  }
  for state in $states; do
    case "$state" in
      running|restarting|paused)
        writer_quiesce_failure="writer service $service remains $state"
        return 1
        ;;
    esac
  done
  return 0
}

writer_stop_service() {
  service="$1"
  if [ "${CARTAVAULT_BACKUP_TESTING:-false}" = true ] || [ "${CARTAVAULT_RESTORE_TESTING:-false}" = true ]; then
    if [ "${CARTAVAULT_QUIESCE_TEST_FAIL_SERVICE:-}" = "$service" ] \
      && { [ -z "${CARTAVAULT_QUIESCE_TEST_FAIL_CONTEXT:-}" ] || [ "${CARTAVAULT_QUIESCE_TEST_FAIL_CONTEXT}" = "$writer_quiesce_context" ]; }; then
      writer_quiesce_failure="injected stop failure for writer service $service"
      return 1
    fi
  fi
  compose stop "$service"
}

quiesce_writers() {
  writer_quiesce_attempted=1
  writer_quiesced=0
  writer_quiesce_failure=""
  writer_discover_services || return 1
  writer_capture_active_services || {
    writer_quiesce_failure="unable to inspect active writer services"
    return 1
  }

  # Stop the queue consumer first so no new task-side writes can begin.
  for service in worker cartavault; do
    if writer_is_configured "$service"; then
      printf '[writers] Stopping writer service: %s\n' "$service"
      if ! writer_stop_service "$service"; then
        [ -n "$writer_quiesce_failure" ] || writer_quiesce_failure="unable to stop writer service $service"
        return 1
      fi
      if ! writer_verify_service_stopped "$service"; then
        return 1
      fi
    fi
  done
  if ! writer_verify_stopped; then
    [ -n "$writer_quiesce_failure" ] || writer_quiesce_failure="one or more writers remain active"
    return 1
  fi
  writer_quiesced=1
  return 0
}

resume_api_writer() {
  if writer_was_active cartavault; then
    printf '[writers] Starting writer service: cartavault\n'
    compose up -d cartavault
  fi
}

resume_worker_writer() {
  if writer_was_active worker; then
    printf '[writers] Starting writer service: worker\n'
    compose up -d worker
  fi
}

resume_writers() {
  resume_api_writer || return 1
  resume_worker_writer || return 1
  writer_quiesced=0
  writer_quiesce_attempted=0
  return 0
}
