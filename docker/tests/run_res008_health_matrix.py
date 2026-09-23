"""Disposable Docker health/readiness failure matrix for RES-008."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time

import httpx


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker" / "tests" / "compose.res008-health.yml"
IMAGE = "cartavault:res008-health-test"
PORT = 18108
BASE = f"http://localhost:{PORT}"


def compose(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), *args],
        cwd=ROOT,
        env={**os.environ, "RES008_HTTP_PORT": str(PORT)},
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def checked(result: subprocess.CompletedProcess[str]) -> str:
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def api_container() -> str:
    container = checked(compose(["ps", "-q", "api"]))
    if not container:
        raise RuntimeError("The API container is missing")
    return container


def state(container: str | None = None) -> dict[str, object]:
    target = container or api_container()
    return json.loads(checked(subprocess.run(
        ["docker", "inspect", target],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )))[0]["State"]


def restart_count(container: str | None = None) -> int:
    target = container or api_container()
    result = subprocess.run(
        ["docker", "inspect", target, "--format", "{{.RestartCount}}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip())


def docker_health() -> str:
    health = state().get("Health")
    if not isinstance(health, dict):
        raise RuntimeError("The API image has no Docker health state")
    return str(health.get("Status"))


def wait_http(path: str, expected: int, timeout: float = 60) -> float:
    started = time.monotonic()
    deadline = started + timeout
    while time.monotonic() < deadline:
        try:
            response = httpx.get(f"{BASE}{path}", timeout=2)
            if response.status_code == expected:
                return time.monotonic() - started
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"{path} did not return HTTP {expected}")


def wait_docker_health(expected: str, timeout: float = 60) -> float:
    started = time.monotonic()
    deadline = started + timeout
    while time.monotonic() < deadline:
        if docker_health() == expected:
            return time.monotonic() - started
        time.sleep(0.25)
    raise RuntimeError(f"Docker health did not become {expected}; got {docker_health()}")


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
        checked(compose(["up", "-d", "api"], timeout=240))
        baseline_liveness = wait_http("/healthz", 200)
        baseline_readiness = wait_http("/health/ready", 200)
        baseline_health = wait_docker_health("healthy")
        container_before = api_container()
        state_before = state()
        restart_count_before = restart_count()
        print(
            f"[res008] PASS baseline: healthz=200, ready=200, Docker=healthy "
            f"({baseline_liveness:.2f}s/{baseline_readiness:.2f}s/{baseline_health:.2f}s)",
            flush=True,
        )

        outage_started = time.monotonic()
        checked(compose(["stop", "postgis"], timeout=60))
        wait_http("/healthz", 200)
        wait_http("/health/ready", 503)
        outage_to_not_ready = time.monotonic() - outage_started
        wait_docker_health("unhealthy")
        outage_to_unhealthy = time.monotonic() - outage_started
        try:
            business = httpx.post(
                f"{BASE}/api/auth/register",
                json={
                    "email": "outage@res008.test",
                    "password": "Res008Health!2026",
                    "confirmation": "Res008Health!2026",
                    "locale": "en",
                    "terms_accepted": True,
                    "website": "",
                },
                timeout=5,
            )
        except httpx.HTTPError as error:
            business_result = f"bounded {type(error).__name__}"
        else:
            if business.status_code < 500:
                raise RuntimeError(
                    f"DB-dependent business request unexpectedly succeeded: {business.status_code}"
                )
            business_result = f"HTTP {business.status_code}"
        outage_state = state()
        if outage_state["Status"] != "running":
            raise RuntimeError(f"API stopped during outage: {outage_state['Status']}")
        print(
            f"[res008] PASS outage: healthz=200, ready=503, Docker=unhealthy, "
            f"process=running, ready=503 in {outage_to_not_ready:.2f}s, "
            f"Docker=unhealthy in {outage_to_unhealthy:.2f}s "
            f"from first probe ({time.monotonic() - outage_started:.2f}s wall clock), "
            f"business={business_result}",
            flush=True,
        )

        recovery_started = time.monotonic()
        checked(compose(["start", "postgis"], timeout=120))
        wait_http("/health/ready", 200)
        recovery_to_ready = time.monotonic() - recovery_started
        wait_docker_health("healthy")
        recovery_to_healthy = time.monotonic() - recovery_started
        container_after = api_container()
        state_after = state()
        if container_after != container_before:
            raise RuntimeError("API container identity changed during DB recovery")
        if state_after["StartedAt"] != state_before["StartedAt"]:
            raise RuntimeError("API container restarted during DB recovery")
        if restart_count() != restart_count_before:
            raise RuntimeError("API restart count changed during DB recovery")
        print(
            f"[res008] PASS recovery: ready=200, Docker=healthy, no app restart "
            f"(ready {recovery_to_ready:.2f}s, healthy {recovery_to_healthy:.2f}s)",
            flush=True,
        )

        flap_times: list[float] = []
        for cycle in range(1, 3):
            checked(compose(["stop", "postgis"], timeout=60))
            wait_http("/health/ready", 503)
            wait_docker_health("unhealthy")
            checked(compose(["start", "postgis"], timeout=120))
            flap_times.append(wait_docker_health("healthy"))
            wait_http("/health/ready", 200, timeout=30)
        if state()["StartedAt"] != state_before["StartedAt"]:
            raise RuntimeError("API restarted during DB flaps")
        print(
            f"[res008] PASS DB flaps: healthy recovery waits "
            f"{flap_times[0]:.2f}s/{flap_times[1]:.2f}s, no app restart",
            flush=True,
        )

        checked(compose(["stop", "postgis"], timeout=60))
        wait_docker_health("unhealthy")
        time.sleep(6)
        long_outage_state = state()
        if long_outage_state["Status"] != "running":
            raise RuntimeError("API stopped during long database outage")
        if restart_count() != restart_count_before:
            raise RuntimeError("API restart count changed during long outage")
        print("[res008] PASS long outage: process running and Docker healthcheck remains active", flush=True)

        shutdown_started = time.monotonic()
        checked(compose(["stop", "api"], timeout=60))
        shutdown_seconds = time.monotonic() - shutdown_started
        stopped_state = state(container_before)
        if stopped_state["Status"] != "exited":
            raise RuntimeError(f"API did not stop cleanly during DB outage: {stopped_state['Status']}")
        print(
            f"[res008] PASS shutdown while DB down: exited cleanly in {shutdown_seconds:.2f}s",
            flush=True,
        )
        return 0
    finally:
        checked(compose(["down", "-v", "--remove-orphans"], timeout=120))
        image = subprocess.run(["docker", "image", "rm", "-f", IMAGE], cwd=ROOT, capture_output=True, text=True)
        if image.returncode and "No such image" not in image.stderr:
            raise RuntimeError(image.stderr or image.stdout)


if __name__ == "__main__":
    raise SystemExit(main())
