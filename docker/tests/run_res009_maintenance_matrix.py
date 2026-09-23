"""Disposable two-replica PostgreSQL advisory-lock recovery matrix for RES-009."""

from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import sys
import time

import httpx


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker" / "tests" / "compose.res009-maintenance.yml"
IMAGE = "cartavault:res009-maintenance-test"
PORT_A = 18109
PORT_B = 18110
BASE_A = f"http://localhost:{PORT_A}"
BASE_B = f"http://localhost:{PORT_B}"
LOCK_QUERY = """
SELECT count(*)
FROM pg_locks
WHERE locktype = 'advisory'
  AND granted
  AND classid = ((hashtext('cartavault:v1:maintenance-leader')::bigint >> 32) & 4294967295)
  AND objid = (hashtext('cartavault:v1:maintenance-leader')::bigint & 4294967295)
"""


def compose(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), *args],
        cwd=ROOT,
        env={**os.environ, "RES009_HTTP_PORT_A": str(PORT_A), "RES009_HTTP_PORT_B": str(PORT_B)},
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def checked(result: subprocess.CompletedProcess[str]) -> str:
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def psql(query: str) -> str:
    return checked(compose(["exec", "-T", "postgis", "psql", "-U", "res009", "-d", "res009", "-tAc", query]))


def lock_holders() -> int:
    return int(psql(LOCK_QUERY))


def wait_health(base: str, timeout: float = 120) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{base}/healthz", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError(f"API did not become ready: {base}")


def wait_holders(expected: int, timeout: float = 30) -> float:
    started = time.monotonic()
    deadline = started + timeout
    while time.monotonic() < deadline:
        if lock_holders() == expected:
            return time.monotonic() - started
        time.sleep(0.25)
    raise RuntimeError(f"Expected {expected} advisory lock holders, got {lock_holders()}")


def assert_api_containers_running() -> None:
    state = checked(compose(["ps", "-a"]))
    for service in ("api-a-1", "api-b-1"):
        if service not in state or "Exited" in state.split(service, 1)[1].splitlines()[0]:
            raise RuntimeError(f"API container is not running during database outage: {service}")


def logs(_service: str = "") -> str:
    # Application events are retained by InstanceLogHandler. The Uvicorn
    # console configuration intentionally only exposes access logs, so this is
    # the authoritative observable event stream for the matrix.
    return psql("SELECT coalesce(string_agg(message, E'\\n' ORDER BY id), '') FROM instance_logs")


def count_log(text: str, pattern: str) -> int:
    return len(re.findall(re.escape(pattern), text))


def main() -> int:
    checked(compose(["down", "-v", "--remove-orphans"]))
    build = subprocess.run(
        ["docker", "build", "-f", "docker/tests/Dockerfile.task-recovery", "-t", IMAGE, "."],
        cwd=ROOT,
        text=True,
    )
    if build.returncode:
        return build.returncode
    try:
        checked(compose(["up", "-d", "postgis"]))
        checked(compose(["up", "-d", "api-a"], timeout=240))
        wait_health(BASE_A)
        checked(compose(["up", "-d", "api-b"], timeout=240))
        wait_health(BASE_B)

        initial_latency = wait_holders(1)
        initial_logs = logs()
        acquired_log_count = count_log(initial_logs, "maintenance_leader_acquired instance=")
        if acquired_log_count != 1:
            raise RuntimeError(
                f"Initial election did not produce exactly one acquired leader log: "
                f"count={acquired_log_count} holders={lock_holders()} "
                f"logs={initial_logs[-4000:]}"
            )
        print(f"[res009] PASS initial election: 1 holder in {initial_latency:.2f}s", flush=True)

        checked(compose(["stop", "postgis"], timeout=60))
        assert_api_containers_running()
        print("[res009] PASS PostgreSQL outage: both replicas lost leadership and stayed running", flush=True)

        checked(compose(["start", "postgis"], timeout=120))
        recovery_latency = wait_holders(1, timeout=30)
        recovered_logs = logs()
        if count_log(recovered_logs, "maintenance_leader_reacquired instance=") < 1:
            raise RuntimeError("No reacquisition log after PostgreSQL restart")
        reacquired_instances = re.findall(
            r"maintenance_leader_reacquired instance=(res009-[ab])",
            recovered_logs,
        )
        recovered_instance = reacquired_instances[-1]
        recovered_follower = "res009-b" if recovered_instance == "res009-a" else "res009-a"
        print(f"[res009] PASS PostgreSQL restart: 1 holder reacquired in {recovery_latency:.2f}s", flush=True)

        recovery_log_baseline = recovered_logs
        job_deadline = time.monotonic() + 15
        while time.monotonic() < job_deadline:
            current_logs = logs()
            new_logs = current_logs[len(recovery_log_baseline):]
            if (
                f"maintenance_job_completed job=periodic_purge instance={recovered_instance}" in new_logs
                and f"maintenance_job_completed job=periodic_purge instance={recovered_follower}" not in new_logs
            ):
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("Leader-only periodic maintenance did not resume")
        print("[res009] PASS maintenance resume: periodic purge resumed after reacquisition", flush=True)

        leader = "api-a" if recovered_instance == "res009-a" else "api-b"
        follower = "api-b" if leader == "api-a" else "api-a"
        checked(compose(["kill", "-s", "SIGKILL", leader], timeout=60))
        failover_latency = wait_holders(1, timeout=30)
        follower_logs = logs(follower)
        if "maintenance_leader_reacquired" not in follower_logs:
            raise RuntimeError("Follower did not acquire leadership after leader crash")
        print(f"[res009] PASS leader crash failover: follower acquired in {failover_latency:.2f}s", flush=True)

        checked(compose(["start", leader], timeout=120))
        wait_health(BASE_A if leader == "api-a" else BASE_B)
        time.sleep(3)
        if lock_holders() != 1:
            raise RuntimeError("Leader rejoin did not preserve exactly one holder")
        print("[res009] PASS leader rejoin: one holder, no split brain", flush=True)

        for cycle in range(2):
            checked(compose(["stop", "postgis"], timeout=60))
            assert_api_containers_running()
            checked(compose(["start", "postgis"], timeout=120))
            latency = wait_holders(1, timeout=30)
            print(f"[res009] PASS DB flap {cycle + 1}: 1 holder reacquired in {latency:.2f}s", flush=True)

        checked(compose(["stop", "postgis"], timeout=60))
        assert_api_containers_running()
        stopped_at = time.monotonic()
        checked(compose(["stop", "api-a", "api-b"], timeout=60))
        shutdown_latency = time.monotonic() - stopped_at
        print(f"[res009] PASS shutdown during DB outage: replicas stopped in {shutdown_latency:.2f}s", flush=True)
        print(f"[res009] TIMING db_recovery={recovery_latency:.2f}s failover={failover_latency:.2f}s", flush=True)
        return 0
    except Exception as error:
        print(f"[res009] FAIL {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        diagnostic = compose(["ps", "-a"], timeout=30)
        print(diagnostic.stdout, file=sys.stderr, flush=True)
        for service in ("api-a", "api-b"):
            service_logs = compose(["logs", "--no-color", service], timeout=30)
            print(f"--- {service} ---\n{service_logs.stdout[-8000:]}", file=sys.stderr, flush=True)
        return 1
    finally:
        compose(["down", "-v", "--remove-orphans"])
        subprocess.run(["docker", "image", "rm", IMAGE], cwd=ROOT, capture_output=True, text=True)


if __name__ == "__main__":
    raise SystemExit(main())
