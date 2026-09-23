#!/usr/bin/env sh
set -eu

script_directory="$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)"
root="${CARTAVAULT_TEST_ROOT:-$(unset CDPATH; cd -- "$script_directory/../.." && pwd)}"
base="$root/docker/tests/compose.operations.yml"
overlay="$root/docker/tests/compose.operations.redis.yml"
project="cartavault-operations-test-$$"
work="${TMPDIR:-/tmp}/cartavault-operations-test-$$"
mkdir -p "$work"

deployed_compose() {
  docker compose --project-name "$project" -f "$base" -f "$overlay" "$@"
}

cleanup() {
  docker compose --project-name "$project" -f "$base" -f "$overlay" down --volumes --remove-orphans >/dev/null 2>&1 || :
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

fail() {
  printf '[operations-safety] FAIL: %s\n' "$*" >&2
  exit 1
}

container_running() {
  service="$1"
  container_id="$(deployed_compose ps -q "$service")"
  [ -n "$container_id" ] && [ "$(docker inspect --format '{{.State.Running}}' "$container_id")" = true ]
}

deployed_compose up -d

# Intentionally begin with only the base file. Resolution must recover the
# deployed overlay from Docker's Compose labels rather than trust this input.
compose_file="$base"
compose_extra_file=""
compose_project="$project"
compose() {
  if [ -n "$compose_extra_file" ]; then
    docker compose --project-name "$compose_project" -f "$compose_file" -f "$compose_extra_file" "$@"
  else
    docker compose --project-name "$compose_project" -f "$compose_file" "$@"
  fi
}
. "$root/docker/operation_safety.sh"
. "$root/docker/writer_quiescence.sh"

resolve_authoritative_compose
[ "$compose_file" = "$base" ] || fail "authoritative base Compose file was not recovered"
[ "$compose_extra_file" = "$overlay" ] || fail "authoritative Redis overlay was not recovered"
writer_discover_services
writer_is_configured cartavault || fail "API writer was not discovered"
writer_is_configured worker || fail "Redis worker was not discovered"
printf '[operations-safety] PASS authoritative Redis deployment resolution\n'

cp "$base" "$work/compose.yml"
cp "$overlay" "$work/compose.redis.yml"
compose_file="$work/compose.yml"
compose_extra_file="$work/compose.redis.yml"
export CARTAVAULT_OPERATION_TESTING=true
export CARTAVAULT_OPERATION_TEST_DEPLOYED_FILES=/portainer/internal/unavailable.yml
resolve_authoritative_compose
[ "$explicit_compose_fallback" -eq 1 ] || fail "explicit Portainer file fallback was not selected"
sed 's/sleep 3600/sleep 123/' "$overlay" >"$work/compose.redis.mismatch.yml"
compose_extra_file="$work/compose.redis.mismatch.yml"
if resolve_authoritative_compose >"$work/worker-hash.log" 2>&1; then
  fail "Portainer fallback accepted a mismatched worker configuration"
fi
grep -q 'does not match the deployed worker service' "$work/worker-hash.log" || fail "worker config-hash rejection was not explicit"
unset CARTAVAULT_OPERATION_TEST_DEPLOYED_FILES
compose_file="$base"
compose_extra_file=""
resolve_authoritative_compose
printf '[operations-safety] PASS inaccessible label paths require config-hash-equivalent host files\n'

deployed_compose rm -sf worker >/dev/null
if resolve_authoritative_compose >"$work/missing-worker.log" 2>&1; then
  fail "Redis mode accepted a missing worker container"
fi
grep -q 'Redis task mode is active but the deployed worker cannot be proven' "$work/missing-worker.log" || fail "missing-worker rejection was not explicit"
deployed_compose up -d worker >/dev/null
resolve_authoritative_compose
printf '[operations-safety] PASS hidden/missing Redis worker fails closed\n'

acquire_operation_lock
if (acquire_operation_lock) >"$work/overlap.log" 2>&1; then
  fail "overlapping recovery operation acquired the shared lock"
fi
grep -q 'another CartaVault backup/restore operation already owns' "$work/overlap.log" || fail "overlap rejection was not explicit"
[ ! -e "$work/protected-mutation" ] || fail "overlap reached protected mutation"
release_operation_lock
printf '[operations-safety] PASS backup/restore overlap rejected before protected action\n'

(
  acquire_operation_lock
  sleep 300 9>&- &
  child_pid=$!
  printf '%s\n' "$child_pid" >"$work/owner-child"
  : >"$work/owner-ready"
  wait "$child_pid"
) &
owner_pid=$!
while [ ! -f "$work/owner-ready" ]; do sleep 0.05; done
owner_child_pid="$(cat "$work/owner-child")"
kill -9 "$owner_pid"
wait "$owner_pid" 2>/dev/null || :
acquire_operation_lock
release_operation_lock
kill "$owner_child_pid" 2>/dev/null || :
container_running cartavault || fail "API changed state when lock owner died"
container_running worker || fail "worker changed state when lock owner died"
printf '[operations-safety] PASS owner death releases lock while child survives, without stale cleanup or writer mutation\n'

export CARTAVAULT_BACKUP_TESTING=true
export CARTAVAULT_QUIESCE_TEST_FAIL_INSPECT_SERVICE=worker
if quiesce_writers >"$work/worker-inspect.log" 2>&1; then
  fail "injected worker inspection failure crossed the quiescence barrier"
fi
container_running worker || fail "worker stopped despite pre-barrier inspection failure"
container_running cartavault || fail "API stopped despite pre-barrier inspection failure"
unset CARTAVAULT_QUIESCE_TEST_FAIL_INSPECT_SERVICE
printf '[operations-safety] PASS writer inspection failure aborts before stop\n'

export CARTAVAULT_QUIESCE_TEST_FAIL_SERVICE=worker
if quiesce_writers >"$work/worker-stop.log" 2>&1; then
  : >"$work/protected-mutation"
  fail "injected worker stop failure crossed the quiescence barrier"
fi
[ ! -e "$work/protected-mutation" ] || fail "worker stop failure reached protected mutation"
container_running worker || fail "worker was not running after its injected stop failure"
container_running cartavault || fail "API stopped despite worker stop failure"
printf '[operations-safety] PASS worker stop failure is a hard pre-mutation barrier\n'

export CARTAVAULT_QUIESCE_TEST_FAIL_SERVICE=cartavault
if quiesce_writers >"$work/api-stop.log" 2>&1; then
  : >"$work/protected-mutation"
  fail "injected API stop failure crossed the quiescence barrier"
fi
[ ! -e "$work/protected-mutation" ] || fail "API stop failure reached protected mutation"
container_running cartavault || fail "API was not running after its injected stop failure"
if container_running worker; then
  fail "worker was not stopped before the injected API stop failure"
fi
resume_writers >/dev/null
container_running worker || fail "worker did not recover after API stop failure"
printf '[operations-safety] PASS API stop failure occurs only after worker stop and remains pre-mutation\n'

unset CARTAVAULT_QUIESCE_TEST_FAIL_SERVICE
quiesce_writers >"$work/stop-order.log" 2>&1
worker_stop_line="$(grep -n 'Stopping writer service: worker' "$work/stop-order.log" | cut -d: -f1)"
api_stop_line="$(grep -n 'Stopping writer service: cartavault' "$work/stop-order.log" | cut -d: -f1)"
[ "$worker_stop_line" -lt "$api_stop_line" ] || fail "writer stop ordering was not worker then API"
resume_writers >"$work/start-order.log" 2>&1
api_start_line="$(grep -n 'Starting writer service: cartavault' "$work/start-order.log" | cut -d: -f1)"
worker_start_line="$(grep -n 'Starting writer service: worker' "$work/start-order.log" | cut -d: -f1)"
[ "$api_start_line" -lt "$worker_start_line" ] || fail "writer start ordering was not API then worker"
container_running cartavault || fail "API did not resume"
container_running worker || fail "worker did not resume"
printf '[operations-safety] PASS worker -> API stop and API -> worker start ordering\n'

deployed_compose rm -sf worker cartavault >/dev/null
compose_file="$base"
compose_extra_file=""
operation_allow_undeployed_compose=1
resolve_authoritative_compose
[ "$deployment_present" -eq 0 ] || fail "undeployed restore bootstrap was not selected"
[ "$task_mode" = sync ] || fail "undeployed standard bootstrap did not resolve sync mode"
deployed_compose up -d cartavault worker >/dev/null
printf '[operations-safety] PASS undeployed restore bootstrap uses explicit standard contract\n'

printf '[operations-safety] SUMMARY 10/10 passed\n'
