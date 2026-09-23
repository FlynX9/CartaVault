"""Disposable crash-recovery failure matrix for RES-004 / RES-006.

Runs against docker/tests/compose.task-recovery.yml with short lease/heartbeat
timings. Every scenario crashes a real process (fault-injection ``os._exit``
simulating SIGKILL, or a literal ``docker kill``), restarts it, and asserts the
task reaches a terminal state with exactly one canonical output.

This harness only touches its own containers, volumes, and network; it never
uses the development database or Redis.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "docker" / "tests" / "compose.task-recovery.yml"
HTTP_PORT = 18095
BASE = f"http://localhost:{HTTP_PORT}/api"
ADMIN_EMAIL = "admin@task-recovery.test"
ADMIN_PASSWORD = "TaskRecovery!Pass2026"

RESULTS: list[dict] = []


def compose(args: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    full_env = os.environ.copy()
    full_env.update({
        "TASK_HTTP_PORT": str(HTTP_PORT),
        "TASK_LEASE_SECONDS": "8",
        "TASK_HEARTBEAT_SECONDS": "3",
        "TASK_RECOVERY_INTERVAL_SECONDS": "3",
        "TASK_STALE_AFTER_SECONDS": "8",
    })
    if env:
        full_env.update(env)
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE)] + args,
        env=full_env, cwd=REPO_ROOT, capture_output=True, text=True,
    )


def log(message: str) -> None:
    print(f"[matrix] {message}", flush=True)


def bring_up(mode: str, crash_point: str = "", stall_seconds: str = "") -> None:
    env = {"TASK_MODE": mode, "TASK_CRASH_POINT": crash_point}
    if stall_seconds:
        env["CARTAVAULT_TASK_STALL_SECONDS"] = stall_seconds
    args = ["up", "-d", "--force-recreate", "--remove-orphans"]
    if mode == "sync":
        # Sync mode executes in-process; a separate worker is not part of the
        # supported topology and would only interfere.
        args += ["--scale", "worker=0"]
    result = compose(args, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"compose up failed: {result.stderr}")


def recreate_clean(mode: str, services: list[str] | None = None) -> None:
    env = {"TASK_MODE": mode, "TASK_CRASH_POINT": ""}
    args = ["up", "-d", "--force-recreate", "--no-deps"]
    if services:
        args += services
    result = compose(args, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"compose recreate failed: {result.stderr}")


def wait_api(timeout: float = 90.0) -> None:
    deadline = time.time() + timeout
    with httpx.Client(timeout=3) as client:
        while time.time() < deadline:
            try:
                if client.get(f"http://localhost:{HTTP_PORT}/healthz").status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(1)
    raise RuntimeError("API did not become healthy")


def wait_container_exited(service: str, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = compose(["ps", "--status", "exited", "--format", "{{.Service}}"])
        if service in result.stdout.split():
            return
        time.sleep(1)
    raise RuntimeError(f"container {service} did not exit")


def psql(query: str) -> str:
    result = compose(["exec", "-T", "postgis", "psql", "-U", "taskuser", "-d", "taskrecovery", "-tAc", query])
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr}")
    return result.stdout.strip()


def seed_country() -> None:
    existing = psql("SELECT count(*) FROM countries")
    if existing and existing != "0":
        return
    psql(
        "INSERT INTO countries (iso_alpha2, iso_alpha3, name, center_latitude, center_longitude, default_zoom) "
        "VALUES ('FR', 'FRA', 'France', 46.6, 2.2, 6)"
    )


class Api:
    def __init__(self) -> None:
        self.client = httpx.Client(base_url=BASE, timeout=30)
        self.csrf = ""

    def login(self) -> None:
        response = self.client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        response.raise_for_status()
        self.csrf = response.json().get("csrf_token") or response.headers.get("X-CSRF-Token", "")

    def post(self, path: str, payload: dict) -> httpx.Response:
        response = self.client.post(path, json=payload, headers={"X-CSRF-Token": self.csrf})
        response.raise_for_status()
        return response

    def get(self, path: str) -> httpx.Response:
        response = self.client.get(path)
        response.raise_for_status()
        return response

    def setup_map_and_trip(self) -> str:
        country_id = self.get("/countries").json()[0]["id"]
        map_id = self.post("/maps", {"country_id": country_id, "name": "Recovery Map"}).json()["id"]
        trip_id = self.post(f"/maps/{map_id}/trips", {"name": "Recovery Trip"}).json()["id"]
        return trip_id

    def export_pdf(self, trip_id: str) -> str:
        response = self.client.post(
            f"/trips/{trip_id}/exports/pdf", json={}, headers={"X-CSRF-Token": self.csrf},
        )
        if response.status_code not in (200, 202):
            raise RuntimeError(f"pdf export request failed: {response.status_code} {response.text[:200]}")
        return response.json()["task_id"]

    def optimize_media(self) -> str:
        response = self.client.post("/admin/console/media/optimize", headers={"X-CSRF-Token": self.csrf})
        response.raise_for_status()
        return response.json()["task_id"]

    def task(self, task_id: str) -> dict:
        return self.get(f"/tasks/{task_id}").json()

    def wait_terminal(self, task_id: str, timeout: float = 90.0) -> dict:
        deadline = time.time() + timeout
        last: dict = {}
        while time.time() < deadline:
            try:
                last = self.task(task_id)
            except httpx.HTTPError:
                time.sleep(1)
                continue
            if last["status"] in ("succeeded", "failed", "cancelled", "expired"):
                return last
            time.sleep(1)
        return last

    def count_exports(self, task_id: str) -> int:
        return int(psql(f"SELECT count(*) FROM generated_exports WHERE task_id = '{task_id}'"))


def record(scenario: str, crash_point: str, passed: bool, detail: str) -> None:
    RESULTS.append({"scenario": scenario, "crash_point": crash_point, "passed": passed, "detail": detail})
    log(f"{'PASS' if passed else 'FAIL'} {scenario}: {detail}")


def run_pdf_crash_scenario(scenario: str, mode: str, crash_point: str, use_kill: bool = False) -> None:
    """Trigger a PDF export, crash the executor, restart, and assert recovery."""
    bring_up(mode, crash_point="stall" if use_kill else crash_point, stall_seconds="25" if use_kill else "")
    wait_api()
    seed_country()
    api = Api()
    api.login()
    trip_id = api.setup_map_and_trip()

    worker_target = "worker" if mode == "redis" else "api"

    if use_kill:
        # The executor claims then stalls (processing_stall), holding the lease.
        # Trigger in a thread because sync-mode execution blocks the request, then
        # hard-kill the container mid-processing.
        import threading

        threading.Thread(target=lambda: api.export_pdf(trip_id), daemon=True).start()
        time.sleep(5)
        compose(["kill", "--signal", "KILL", worker_target])
        wait_container_exited(worker_target)
        task_id = psql(
            "SELECT id FROM background_tasks WHERE task_type = 'trip_pdf_export' "
            f"AND resource_id = '{trip_id}' ORDER BY created_at DESC LIMIT 1"
        )
    else:
        # The crash point fires inside the executor; the request may fail before
        # a task id is returned. The task row was committed before execution, so
        # resolve it from the database by trip.
        try:
            task_id = api.export_pdf(trip_id)
        except Exception:
            task_id = ""
        if not task_id:
            task_id = psql(
                "SELECT id FROM background_tasks WHERE task_type = 'trip_pdf_export' "
                f"AND resource_id = '{trip_id}' ORDER BY created_at DESC LIMIT 1"
            )
        if mode == "sync":
            # Sync runs inline in the API process; os._exit terminates the container.
            wait_container_exited("api")
        else:
            # Redis runs the job in an RQ subprocess; os._exit kills only that
            # subprocess, so the worker container stays up. Give it a moment, then
            # recreate the worker cleanly to drive recovery.
            time.sleep(3)

    if not task_id:
        record(scenario, crash_point, False, "no task id captured")
        return

    status_before = api.task(task_id)["status"] if mode == "redis" else psql(
        f"SELECT status FROM background_tasks WHERE id = '{task_id}'"
    )

    recreate_clean(mode, services=["api"] if mode == "sync" else ["worker"])
    if mode == "sync":
        wait_api()

    final = api.wait_terminal(task_id, timeout=120)
    export_count = api.count_exports(task_id)
    attempt = psql(f"SELECT attempt_count FROM background_tasks WHERE id = '{task_id}'")

    passed = final.get("status") == "succeeded" and export_count == 1
    record(
        scenario, crash_point if not use_kill else "docker-kill",
        passed,
        f"pre={status_before} final={final.get('status')} attempts={attempt} outputs={export_count}",
    )


def run_media_scenarios() -> None:
    bring_up("redis", crash_point="")
    wait_api()
    api = Api()
    api.login()

    task_id = api.optimize_media()
    final = api.wait_terminal(task_id, timeout=90)
    record("M1+M4 media_optimization enqueue+process", "-", final.get("status") == "succeeded",
           f"final={final.get('status')} result={json.dumps(final.get('result') or {})}")

    # M2: broker unavailable -> enqueue must fail with broker_unavailable.
    compose(["stop", "redis"])
    time.sleep(2)
    try:
        response = api.client.post("/admin/console/media/optimize", headers={"X-CSRF-Token": api.csrf})
        body = response.json() if response.content else {}
        task_row = psql(
            "SELECT error_code FROM background_tasks WHERE task_type='media_optimization' "
            "ORDER BY created_at DESC LIMIT 1"
        )
        record("M2 redis unavailable -> broker_unavailable", "-",
               response.status_code == 503 and task_row == "broker_unavailable",
               f"http={response.status_code} error_code={task_row}")
    except Exception as error:  # noqa: BLE001
        record("M2 redis unavailable -> broker_unavailable", "-", False, f"unexpected error {error}")
    compose(["start", "redis"])


def run_api_crash_while_queued() -> None:
    """R1: the API dies right after enqueueing; the queued job must survive and
    the worker must complete it exactly once."""
    bring_up("redis", crash_point="")
    wait_api()
    api = Api()
    api.login()
    trip_id = api.setup_map_and_trip()
    task_id = api.export_pdf(trip_id)
    compose(["kill", "--signal", "KILL", "api"])
    time.sleep(1)
    recreate_clean("redis", services=["api"])
    wait_api()
    final = api.wait_terminal(task_id, timeout=120)
    export_count = api.count_exports(task_id)
    record("R1 API crash while queued", "docker-kill",
           final.get("status") == "succeeded" and export_count == 1,
           f"final={final.get('status')} outputs={export_count}")


def run_multi_worker_race() -> None:
    # Create a stale task with one worker, then bring up two fresh workers that
    # race through recovery; the atomic claim must allow exactly one winner and
    # produce exactly one canonical output.
    bring_up("redis", crash_point="")
    wait_api()
    api = Api()
    api.login()
    trip_id = api.setup_map_and_trip()
    task_id = api.export_pdf(trip_id)
    time.sleep(2)
    compose(["kill", "--signal", "KILL", "worker"])
    time.sleep(1)

    compose(["up", "-d", "--scale", "worker=2", "--force-recreate"], env={"TASK_MODE": "redis", "TASK_CRASH_POINT": ""})

    final = api.wait_terminal(task_id, timeout=120)
    export_count = api.count_exports(task_id)
    attempt = psql(f"SELECT attempt_count FROM background_tasks WHERE id = '{task_id}'")
    record("R6 multi-worker recovery race", "docker-kill",
           final.get("status") == "succeeded" and export_count == 1,
           f"final={final.get('status')} attempts={attempt} outputs={export_count}")


def main() -> int:
    try:
        log("Starting disposable task-recovery stack")
        compose(["down", "-v", "--remove-orphans"])

        log("== SYNC failure matrix ==")
        run_pdf_crash_scenario("S1 crash before claim (pending)", "sync", "before_claim")
        run_pdf_crash_scenario("S2 crash after claim (running)", "sync", "claimed")
        run_pdf_crash_scenario("S3 hard kill mid-processing", "sync", "", use_kill=True)
        run_pdf_crash_scenario("S4 crash before output commit", "sync", "before_output_commit")
        run_pdf_crash_scenario("S5 crash after output commit", "sync", "after_output_commit")

        log("== REDIS failure matrix ==")
        run_api_crash_while_queued()
        run_pdf_crash_scenario("R2 worker hard kill after claim", "redis", "", use_kill=True)
        run_pdf_crash_scenario("R3 worker hard kill mid-processing", "redis", "", use_kill=True)
        run_pdf_crash_scenario("R4 worker crash before output commit", "redis", "before_output_commit")
        run_pdf_crash_scenario("R5 worker crash after output commit", "redis", "after_output_commit")
        run_multi_worker_race()
        run_media_scenarios()
    finally:
        log("Tearing down disposable stack")
        compose(["down", "-v", "--remove-orphans"])

    log("== SUMMARY ==")
    failures = 0
    for item in RESULTS:
        marker = "PASS" if item["passed"] else "FAIL"
        if not item["passed"]:
            failures += 1
        print(f"  {marker}  {item['scenario']:<45} {item['detail']}")
    print(f"\n{len(RESULTS) - failures}/{len(RESULTS)} scenarios passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
