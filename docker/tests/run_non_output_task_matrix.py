"""Real-process crash matrix for KMZ and media optimization task effects."""

from __future__ import annotations

from hashlib import sha256
from io import BytesIO
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import httpx
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker" / "tests" / "compose.task-recovery.yml"
BASE = "http://localhost:18095/api"
RESULTS: list[tuple[str, bool, str]] = []


def compose(args: list[str], *, crash: str = "") -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env.update({
        "TASK_MODE": "redis",
        "TASK_HTTP_PORT": "18095",
        "TASK_LEASE_SECONDS": "8",
        "TASK_HEARTBEAT_SECONDS": "3",
        "TASK_RECOVERY_INTERVAL_SECONDS": "3",
        "TASK_STALE_AFTER_SECONDS": "8",
        "TASK_CRASH_POINT": crash,
    })
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), *args],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )


def psql(query: str) -> str:
    result = compose(["exec", "-T", "postgis", "psql", "-U", "taskuser", "-d", "taskrecovery", "-tAc", query])
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def record(name: str, passed: bool, detail: str) -> None:
    RESULTS.append((name, passed, detail))
    print(f"[non-output] {'PASS' if passed else 'FAIL'} {name}: {detail}", flush=True)


def wait_api() -> None:
    deadline = time.time() + 90
    while time.time() < deadline:
        try:
            if httpx.get("http://localhost:18095/healthz", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError("API not ready")


def wait_worker() -> None:
    deadline = time.time() + 60
    while time.time() < deadline:
        state = compose(["ps", "--format", "{{.Service}} {{.Status}}"]).stdout
        if any(line.startswith("worker Up") for line in state.splitlines()):
            return
        time.sleep(1)
    raise RuntimeError("worker not ready")


def restart_worker(crash: str = "") -> None:
    result = compose(["up", "-d", "--force-recreate", "--no-deps", "worker"], crash=crash)
    if result.returncode:
        raise RuntimeError(result.stderr)
    wait_worker()


def image_bytes(index: int) -> bytes:
    out = BytesIO()
    Image.new("RGB", (96, 64), ((index * 41) % 255, (index * 79) % 255, (index * 127) % 255)).save(out, "PNG")
    return out.getvalue()


def kmz_bytes() -> bytes:
    out = BytesIO()
    marks = [
        f"<Placemark><name>Crash KMZ {i}</name>"
        + ('<description><![CDATA[<img src="files/photo.png">]]></description>' if i == 1 else "")
        + f"<Point><coordinates>{2.30 + i / 100},{48.80 + i / 100}</coordinates></Point></Placemark>"
        for i in range(1, 4)
    ]
    with ZipFile(out, "w", ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", ("<kml><Document>" + "".join(marks) + "</Document></kml>").encode())
        archive.writestr("files/photo.png", image_bytes(1))
    return out.getvalue()


class Api:
    def __init__(self) -> None:
        self.client = httpx.Client(base_url=BASE, timeout=40)
        login = self.client.post("/auth/login", json={
            "email": "admin@task-recovery.test", "password": "TaskRecovery!Pass2026",
        })
        login.raise_for_status()
        self.csrf = login.json()["csrf_token"]

    def post(self, path: str, **kwargs) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}))
        headers["X-CSRF-Token"] = self.csrf
        return self.client.post(path, headers=headers, **kwargs)

    def map(self, name: str) -> str:
        countries = self.client.get("/countries?q=FRA").json()
        country = next(item["id"] for item in countries if item["iso_alpha3"] == "FRA")
        response = self.post("/maps", json={"country_id": country, "name": name})
        response.raise_for_status()
        return response.json()["id"]

    def place(self, map_id: str, name: str) -> str:
        response = self.post("/places", json={
            "name": name, "map_id": map_id, "latitude": 48.0, "longitude": 2.0,
        })
        response.raise_for_status()
        return response.json()["id"]

    def upload_photos(self, place_id: str, count: int) -> list[str]:
        result = []
        for index in range(count):
            response = self.post(
                f"/places/{place_id}/photos/upload",
                files={"file": (f"photo-{index}.png", image_bytes(index), "image/png")},
            )
            response.raise_for_status()
            result.append(response.json()["id"])
        return result

    def task(self, task_id: str) -> dict:
        response = self.client.get(f"/tasks/{task_id}")
        response.raise_for_status()
        return response.json()

    def wait_terminal(self, task_id: str, timeout: float = 120) -> dict:
        deadline = time.time() + timeout
        last = {}
        while time.time() < deadline:
            last = self.task(task_id)
            if last["status"] in {"succeeded", "failed", "cancelled", "expired"}:
                return last
            time.sleep(1)
        return last

    def start_optimization(self) -> str:
        response = self.post("/admin/console/media/optimize")
        response.raise_for_status()
        return response.json()["task_id"]


def photo_state(photo_ids: list[str]) -> list[tuple[str, str, int, int, int]]:
    ids = ",".join(f"'{value}'" for value in photo_ids)
    raw = psql(
        "SELECT id||'|'||path||'|'||file_size_bytes||'|'||width||'|'||height "
        f"FROM photos WHERE id IN ({ids}) ORDER BY id"
    )
    return [tuple([parts[0], parts[1], *map(int, parts[2:])]) for parts in (line.split("|") for line in raw.splitlines())]


def photo_hashes(photo_ids: list[str]) -> dict[str, str]:
    states = photo_state(photo_ids)
    result = {}
    for photo_id, path, *_rest in states:
        command = compose(["exec", "-T", "api", "python", "-c",
            f"from pathlib import Path; import hashlib; print(hashlib.sha256(Path('/app/storage/photos/{path}').read_bytes()).hexdigest())"])
        if command.returncode:
            raise RuntimeError(command.stderr)
        result[photo_id] = command.stdout.strip()
    return result


def validate_photos(photo_ids: list[str]) -> tuple[bool, str]:
    states = photo_state(photo_ids)
    valid = len(states) == len(photo_ids) and all(path.endswith(".webp") and size > 0 and width > 0 and height > 0 for _id, path, size, width, height in states)
    ids = ",".join(f"'{value}'" for value in photo_ids)
    db_bytes = int(psql(f"SELECT coalesce(sum(file_size_bytes),0) FROM photos WHERE id IN ({ids})"))
    physical = 0
    for _id, path, *_rest in states:
        physical += int(compose(["exec", "-T", "api", "python", "-c", f"from pathlib import Path; print(Path('/app/storage/photos/{path}').stat().st_size)"]).stdout.strip())
    return valid and db_bytes == physical, f"rows={len(states)} db_bytes={db_bytes} physical={physical}"


def run_kmz() -> None:
    api = Api()
    map_id = api.map(f"KMZ {uuid4().hex}")
    preview = api.post(
        f"/maps/{map_id}/imports/kmz/preview",
        files={"file": ("crash.kmz", kmz_bytes(), "application/vnd.google-earth.kmz")},
    )
    preview.raise_for_status()
    import_id = preview.json()["import_id"]

    restart_worker("kmz_after_place")
    start = api.post(f"/maps/{map_id}/imports/kmz/confirm-jobs", json={
        "import_id": import_id, "selected_source_indexes": [0, 1, 2],
        "download_remote_images": False, "force_source_indexes": [],
    })
    start.raise_for_status()
    task_id = start.json()["job_id"]
    time.sleep(3)
    restart_worker("")
    final = api.wait_terminal(task_id)
    places = int(psql(f"SELECT count(*) FROM places WHERE map_id='{map_id}' AND name LIKE 'Crash KMZ %'"))
    photos = int(psql(f"SELECT count(*) FROM photos WHERE map_id='{map_id}'"))
    categories = int(psql(f"SELECT count(*) FROM categories WHERE map_id='{map_id}' AND lower(name)='importé'"))
    statuses = int(psql(f"SELECT count(*) FROM place_statuses WHERE map_id='{map_id}' AND slug='importe'"))
    preview_rows = int(psql(f"SELECT count(*) FROM kmz_import_previews WHERE id='{import_id}'"))
    record("K1 partial KMZ crash + recovery", final.get("status") == "succeeded" and (places, photos, categories, statuses, preview_rows) == (3, 1, 1, 1, 0),
           f"task={final.get('status')} places={places} photos={photos} category={categories} status={statuses} preview={preview_rows}")

    # K2 is structurally a single transaction: business rows and task success
    # commit together. Crash immediately before finalization rolls everything
    # back; retry commits both exactly once.
    map2 = api.map(f"KMZ commit {uuid4().hex}")
    preview2 = api.post(f"/maps/{map2}/imports/kmz/preview", files={"file": ("commit.kmz", kmz_bytes(), "application/vnd.google-earth.kmz")})
    preview2.raise_for_status()
    import2 = preview2.json()["import_id"]
    restart_worker("before_task_success")
    start2 = api.post(f"/maps/{map2}/imports/kmz/confirm-jobs", json={"import_id": import2, "selected_source_indexes": [0, 1, 2]})
    start2.raise_for_status()
    task2 = start2.json()["job_id"]
    time.sleep(3)
    restart_worker("")
    final2 = api.wait_terminal(task2)
    places2 = int(psql(f"SELECT count(*) FROM places WHERE map_id='{map2}' AND name LIKE 'Crash KMZ %'"))
    record("K2 KMZ finalization transaction", final2.get("status") == "succeeded" and places2 == 3,
           f"task={final2.get('status')} places={places2} attempts={psql(f'SELECT attempt_count FROM background_tasks WHERE id=\'{task2}\'')}")


def run_media() -> None:
    api = Api()
    map_id = api.map(f"Media {uuid4().hex}")
    place_id = api.place(map_id, "Media crash set")

    # M1: a worker crash before any modification is automatically recovered by
    # the task supervisor; no manual resubmission is required.
    ids = api.upload_photos(place_id, 3)
    restart_worker("media_before_first")
    first = api.start_optimization()
    time.sleep(2)
    restart_worker("")
    recovered = api.wait_terminal(first)
    valid, detail = validate_photos(ids)
    attempts = psql(f"SELECT attempt_count FROM background_tasks WHERE id='{first}'")
    record("M1 crash before first modification", recovered.get("status") == "succeeded" and attempts == "2" and valid,
           f"task={recovered.get('status')} attempts={attempts} {detail}")

    # M2: first ten are committed, then the worker dies. Recovery must reuse
    # them without changing their hashes and optimize only the remainder.
    place2 = api.place(map_id, "Media partial batch")
    ids2 = api.upload_photos(place2, 12)
    restart_worker("media_after_batch_commit")
    task = api.start_optimization()
    time.sleep(3)
    committed_ids = [row.split("|")[0] for row in psql(
        f"SELECT id||'|'||mime_type FROM photos WHERE id IN ({','.join(repr(value) for value in ids2)}) AND mime_type='image/webp' ORDER BY id"
    ).splitlines() if row]
    hashes = photo_hashes(committed_ids)
    first_state = psql(f"SELECT status FROM background_tasks WHERE id='{task}'")
    restart_worker("")
    recovered2 = api.wait_terminal(task)
    valid2, detail2 = validate_photos(ids + ids2)
    preserved = photo_hashes(committed_ids) == hashes
    attempts2 = psql(f"SELECT attempt_count FROM background_tasks WHERE id='{task}'")
    record("M2 crash after partial committed batch", recovered2.get("status") == "succeeded" and first_state == "running" and attempts2 == "2" and len(committed_ids) >= 5 and preserved and valid2,
           f"first={first_state} recovery={recovered2.get('status')} attempts={attempts2} committed_before_recovery={len(committed_ids)} hashes_preserved={preserved} {detail2}")

    # M3: replacement persisted, DB still points to the original. Deferred
    # deletion keeps that original readable until recovery commits metadata.
    place3 = api.place(map_id, "Media persist window")
    ids3 = api.upload_photos(place3, 1)
    original_path3 = psql(f"SELECT path FROM photos WHERE id='{ids3[0]}'")
    restart_worker("media_after_file_persist")
    task3 = api.start_optimization()
    time.sleep(3)
    original_exists = compose(["exec", "-T", "api", "test", "-f", f"/app/storage/photos/{original_path3}"]).returncode == 0
    restart_worker("")
    recovered3 = api.wait_terminal(task3)
    valid3, detail3 = validate_photos(ids + ids2 + ids3)
    attempts3 = psql(f"SELECT attempt_count FROM background_tasks WHERE id='{task3}'")
    record("M3 crash after file persist before metadata", recovered3.get("status") == "succeeded" and attempts3 == "2" and original_exists and valid3,
           f"task={recovered3.get('status')} attempts={attempts3} original_survived={original_exists} {detail3}")

    # M4: handler commits media effects, then process dies before task success.
    # Automatic recovery must skip the committed WebPs (hashes unchanged).
    place4 = api.place(map_id, "Media finalization window")
    ids4 = api.upload_photos(place4, 3)
    restart_worker("before_task_success")
    task4 = api.start_optimization()
    time.sleep(3)
    committed_hashes4 = photo_hashes(ids4)
    restart_worker("")
    recovered4 = api.wait_terminal(task4)
    valid4, detail4 = validate_photos(ids + ids2 + ids3 + ids4)
    preserved4 = photo_hashes(ids4) == committed_hashes4
    attempts4 = psql(f"SELECT attempt_count FROM background_tasks WHERE id='{task4}'")
    record("M4 crash after DB commit before task success", recovered4.get("status") == "succeeded" and attempts4 == "2" and preserved4 and valid4,
           f"task={recovered4.get('status')} attempts={attempts4} hashes_preserved={preserved4} {detail4}")

    # Two workers may both observe the failed operation/resubmission boundary,
    # but only one claim may mutate the business data. The final hashes and
    # quota must remain identical to one optimization.
    place5 = api.place(map_id, "Media multi worker")
    ids5 = api.upload_photos(place5, 4)
    scaled = compose(["up", "-d", "--scale", "worker=2", "--force-recreate"], crash="")
    if scaled.returncode:
        raise RuntimeError(scaled.stderr)
    task5 = api.start_optimization()
    final5 = api.wait_terminal(task5)
    hashes5 = photo_hashes(ids5)
    valid5, detail5 = validate_photos(ids + ids2 + ids3 + ids4 + ids5)
    attempts5 = psql(f"SELECT attempt_count FROM background_tasks WHERE id='{task5}'")
    record("M5 two-worker business-state claim", final5.get("status") == "succeeded" and attempts5 == "1" and valid5 and photo_hashes(ids5) == hashes5,
           f"task={final5.get('status')} attempts={attempts5} hashes_stable={photo_hashes(ids5) == hashes5} {detail5}")


def main() -> int:
    try:
        compose(["down", "-v", "--remove-orphans"])
        up = compose(["up", "-d", "--force-recreate"])
        if up.returncode:
            raise RuntimeError(up.stderr)
        wait_api()
        wait_worker()
        run_kmz()
        run_media()
    finally:
        compose(["down", "-v", "--remove-orphans"])
    failures = [item for item in RESULTS if not item[1]]
    print(f"{len(RESULTS) - len(failures)}/{len(RESULTS)} scenarios passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
