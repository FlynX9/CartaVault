"""Disposable real PostgreSQL/filesystem/MinIO matrix for RES-005."""

from __future__ import annotations

from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4

import httpx
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker" / "tests" / "compose.res005-consistency.yml"
IMAGE = "cartavault:res005-consistency-test"
BASE = "http://localhost:18096/api"
RESULTS: list[tuple[str, str]] = []


def compose(args: list[str], *, mode: str, crash: str = "", timeout: int = 120) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env.update({
        "RES005_MEDIA_STORAGE": mode,
        "RES005_CRASH_POINT": crash,
        "RES005_HTTP_PORT": "18096",
    })
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), *args],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def checked(result: subprocess.CompletedProcess) -> str:
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def record(name: str, detail: str) -> None:
    RESULTS.append((name, detail))
    print(f"[res005] PASS {name}: {detail}", flush=True)


def wait_api(mode: str, timeout: float = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if httpx.get("http://localhost:18096/healthz", timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError(f"{mode} API did not become ready")


def wait_minio(mode: str, timeout: float = 60) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = compose(
            ["exec", "-T", "minio", "curl", "-f", "http://127.0.0.1:9000/minio/health/live"],
            mode=mode,
        )
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("MinIO did not become ready")


def psql(query: str, *, mode: str) -> str:
    return checked(compose(
        ["exec", "-T", "postgis", "psql", "-U", "res005", "-d", "res005", "-tAc", query],
        mode=mode,
    ))


def run_python(code: str, *, mode: str) -> str:
    return checked(compose(
        ["run", "--rm", "--no-deps", "--entrypoint", "python", "api", "-c", code],
        mode=mode,
        timeout=180,
    )).splitlines()[-1]


def image_bytes(seed: int = 1) -> bytes:
    output = BytesIO()
    Image.new("RGB", (48, 32), (seed * 31 % 255, seed * 71 % 255, seed * 113 % 255)).save(output, "PNG")
    return output.getvalue()


class Api:
    def __init__(self) -> None:
        self.client = httpx.Client(base_url=BASE, timeout=90)
        response = self.client.post("/auth/login", json={
            "email": "admin@res005.test",
            "password": "Res005Consistency!2026",
        })
        response.raise_for_status()
        self.csrf = response.json()["csrf_token"]

    def post(self, path: str, **kwargs) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}))
        headers["X-CSRF-Token"] = self.csrf
        return self.client.post(path, headers=headers, **kwargs)

    def delete(self, path: str) -> httpx.Response:
        return self.client.delete(path, headers={"X-CSRF-Token": self.csrf})

    def map_and_place(self, suffix: str) -> tuple[str, str]:
        countries = self.client.get("/countries?q=FRA").json()
        country_id = next(item["id"] for item in countries if item["iso_alpha3"] == "FRA")
        result = self.post("/maps", json={"country_id": country_id, "name": f"RES005 {suffix}"})
        result.raise_for_status()
        map_id = result.json()["id"]
        result = self.post("/places", json={
            "name": f"RES005 {suffix}", "map_id": map_id, "latitude": 48.85, "longitude": 2.35,
        })
        result.raise_for_status()
        return map_id, result.json()["id"]

    def upload(self, place_id: str, seed: int = 1) -> str:
        result = self.post(
            f"/places/{place_id}/photos/upload",
            files={"file": (f"res005-{seed}.png", image_bytes(seed), "image/png")},
        )
        if result.status_code != 201:
            raise RuntimeError(f"upload failed status={result.status_code} body={result.text}")
        return result.json()["id"]


def object_exists(mode: str, key: str, *, full_s3_key: bool = False) -> bool:
    if mode == "local":
        code = f"from pathlib import Path; print(int((Path('/app/storage/photos') / {key!r}).is_file()))"
    else:
        object_key = key if full_s3_key else f"carta-media/{key}"
        code = (
            "import boto3; from botocore.client import Config; "
            "from botocore.exceptions import ClientError; "
            "c=boto3.client('s3',endpoint_url='http://minio:9000',region_name='us-east-1',"
            "aws_access_key_id='res005-access',aws_secret_access_key='res005-secret-key',"
            "config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); "
            f"k={object_key!r}; "
            "print(int(any(x['Key']==k for p in c.get_paginator('list_objects_v2').paginate(Bucket='cartavault-res005') for x in p.get('Contents',[]))))"
        )
    return run_python(code, mode=mode) == "1"


def wait_converged(mode: str, key: str, timeout: float = 30) -> float:
    started = time.monotonic()
    deadline = started + timeout
    while time.monotonic() < deadline:
        pending = int(psql(f"select count(*) from storage_operations where object_key='{key}'", mode=mode))
        if pending == 0 and not object_exists(mode, key):
            return time.monotonic() - started
        time.sleep(1)
    raise RuntimeError(f"cleanup did not converge for {key}")


def abandoned_write(mode: str) -> tuple[str, float]:
    code = (
        "import app.models; from io import BytesIO; from uuid import uuid4; from PIL import Image; "
        "from app.database import SessionLocal; from app.photos.reconciliation import canonical_media_object_key,prepare_storage_write_cleanup; "
        "from app.photos.storage import store_photo_file; s=SessionLocal(); scope=uuid4(); photo=uuid4(); "
        "key=canonical_media_object_key(scope,photo,'image/png'); prepare_storage_write_cleanup(s,namespace='media',object_key=key); "
        "b=BytesIO(); Image.new('RGB',(24,16),(20,80,140)).save(b,'PNG'); b.seek(0); "
        "store_photo_file(b,'image/png',scope,photo); s.rollback(); s.close(); print(key)"
    )
    key = run_python(code, mode=mode)
    if not object_exists(mode, key):
        raise RuntimeError("abandoned write blob was not observed")
    if psql(f"select count(*) from photos where path='{key}'", mode=mode) != "0":
        raise RuntimeError("abandoned write unexpectedly created metadata")
    return key, wait_converged(mode, key)


def run_local() -> None:
    mode = "local"
    checked(compose(["down", "-v", "--remove-orphans"], mode=mode))
    checked(compose(["up", "-d"], mode=mode, timeout=240))
    wait_api(mode)
    api = Api()
    _, place_id = api.map_and_place("local")

    happy_id = api.upload(place_id, 1)
    happy_path = psql(f"select path from photos where id='{happy_id}'", mode=mode)
    assert object_exists(mode, happy_path)
    record("L0 local happy upload", "DB reference and filesystem blob exist")

    key, latency = abandoned_write(mode)
    record("L1 write then DB rollback", f"orphan={key} cleaned in {latency:.1f}s")

    # Hard process death after the durable write intent and physical rename.
    checked(compose(["up", "-d", "--force-recreate", "--no-deps", "api"], mode=mode, crash="storage_after_write", timeout=180))
    wait_api(mode)
    crashing_api = Api()
    try:
        crashing_api.post(
            f"/places/{place_id}/photos/upload",
            files={"file": ("hard-crash.png", image_bytes(2), "image/png")},
        )
    except httpx.HTTPError:
        pass
    deadline = time.time() + 20
    while time.time() < deadline and compose(["ps", "-q", "api"], mode=mode).stdout.strip():
        time.sleep(0.5)
    key = psql("select object_key from storage_operations where purpose='write_cleanup' order by created_at desc limit 1", mode=mode)
    assert key and object_exists(mode, key)
    assert psql(f"select count(*) from photos where path='{key}'", mode=mode) == "0"
    checked(compose(["up", "-d", "--force-recreate", "--no-deps", "api"], mode=mode, timeout=180))
    wait_api(mode)
    latency = wait_converged(mode, key)
    record("L2 hard crash after blob write", f"automatic restart convergence in {latency:.1f}s")

    api = Api()
    delete_id = api.upload(place_id, 3)
    delete_path = psql(f"select path from photos where id='{delete_id}'", mode=mode)
    directory = f"/app/storage/photos/{delete_path.rsplit('/', 1)[0]}"
    checked(compose(["exec", "-T", "api", "chmod", "500", directory], mode=mode))
    response = api.delete(f"/photos/{delete_id}")
    assert response.status_code == 204
    assert object_exists(mode, delete_path)
    assert int(psql(f"select count(*) from storage_operations where object_key='{delete_path}' and attempt_count > 0", mode=mode)) == 1
    checked(compose(["exec", "-T", "api", "chmod", "700", directory], mode=mode))
    latency = wait_converged(mode, delete_path)
    assert psql(f"select count(*) from photos where id='{delete_id}'", mode=mode) == "0"
    record("L3 logical delete plus unlink failure", f"204 + durable retry converged in {latency:.1f}s")

    missing_id = api.upload(place_id, 4)
    missing_path = psql(f"select path from photos where id='{missing_id}'", mode=mode)
    checked(compose(["exec", "-T", "api", "rm", f"/app/storage/photos/{missing_path}"], mode=mode))
    deadline = time.time() + 20
    while time.time() < deadline:
        if psql(f"select storage_state from photos where id='{missing_id}'", mode=mode) == "missing":
            break
        time.sleep(1)
    assert psql(f"select storage_state from photos where id='{missing_id}'", mode=mode) == "missing"
    assert api.client.get(f"/photos/{missing_id}/file").status_code == 404
    assert int(psql(f"select file_size_bytes from photos where id='{missing_id}'", mode=mode)) > 0
    assert api.delete(f"/photos/{missing_id}").status_code == 204
    record("L4 missing referenced blob", "durable missing state, HTTP 404, DB quota metadata retained")


def put_s3_objects(mode: str, objects: dict[str, bytes]) -> None:
    encoded = {key: value.hex() for key, value in objects.items()}
    code = (
        "import boto3; from botocore.client import Config; "
        "c=boto3.client('s3',endpoint_url='http://minio:9000',region_name='us-east-1',"
        "aws_access_key_id='res005-access',aws_secret_access_key='res005-secret-key',"
        "config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); "
        f"items={encoded!r}; "
        "[c.put_object(Bucket='cartavault-res005',Key=k,Body=bytes.fromhex(v)) for k,v in items.items()]; print('ok')"
    )
    assert run_python(code, mode=mode) == "ok"


def run_s3() -> None:
    mode = "s3"
    checked(compose(["down", "-v", "--remove-orphans"], mode=mode))
    checked(compose(["up", "-d"], mode=mode, timeout=240))
    wait_api(mode)
    api = Api()
    _, place_id = api.map_and_place("s3")

    happy_id = api.upload(place_id, 10)
    happy_path = psql(f"select path from photos where id='{happy_id}'", mode=mode)
    assert object_exists(mode, happy_path)
    record("S0 MinIO happy upload", "DB reference and prefixed object exist")

    key, latency = abandoned_write(mode)
    record("S1 PutObject then DB rollback", f"remote orphan cleaned in {latency:.1f}s")

    delete_id = api.upload(place_id, 11)
    delete_path = psql(f"select path from photos where id='{delete_id}'", mode=mode)
    checked(compose(["stop", "minio"], mode=mode))
    response = api.delete(f"/photos/{delete_id}")
    assert response.status_code == 204
    assert psql(f"select count(*) from photos where id='{delete_id}'", mode=mode) == "0"
    assert int(psql(f"select count(*) from storage_operations where object_key='{delete_path}' and attempt_count > 0", mode=mode)) == 1
    checked(compose(["start", "minio"], mode=mode))
    wait_minio(mode)
    latency = wait_converged(mode, delete_path, timeout=45)
    record("S2-S5 MinIO unavailable during delete/retry", f"204 + pending cleanup recovered in {latency:.1f}s")

    orphan_scope, orphan_id = uuid4(), uuid4()
    orphan_key = f"{orphan_scope}/{orphan_id}.jpg"
    alias_key = f"{orphan_scope}/{uuid4()}.jpg/"
    put_s3_objects(mode, {
        f"carta-media/{orphan_key}": b"orphan",
        f"carta-media/{alias_key}": b"unsafe-alias",
        "outside/sentinel": b"outside",
        "carta-media/.cartavault-restore/sentinel": b"reserved",
    })
    dry_output = checked(compose(
        ["exec", "-T", "api", "python", "-m", "app.cli", "storage-reconcile", "--grace-seconds", "0"],
        mode=mode,
        timeout=180,
    ))
    dry_report = json.loads(dry_output)
    assert orphan_key in {item["object_key"] for item in dry_report["orphan_media"]}
    assert alias_key in {item["object_key"] for item in dry_report["unsupported_unsafe"]}
    assert object_exists(mode, orphan_key)
    checked(compose(
        ["exec", "-T", "api", "python", "-m", "app.cli", "storage-reconcile", "--repair", "--grace-seconds", "0"],
        mode=mode,
        timeout=180,
    ))
    assert not object_exists(mode, orphan_key)
    assert object_exists(mode, alias_key)
    assert object_exists(mode, "outside/sentinel", full_s3_key=True)
    assert object_exists(mode, "carta-media/.cartavault-restore/sentinel", full_s3_key=True)
    record("S6 deep reconcile prefix safety", "orphan removed; alias/outside/reserved sentinels untouched")

    missing_id = api.upload(place_id, 12)
    missing_path = psql(f"select path from photos where id='{missing_id}'", mode=mode)
    code = (
        "import boto3; from botocore.client import Config; "
        "c=boto3.client('s3',endpoint_url='http://minio:9000',region_name='us-east-1',"
        "aws_access_key_id='res005-access',aws_secret_access_key='res005-secret-key',"
        "config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); "
        f"c.delete_object(Bucket='cartavault-res005',Key={'carta-media/' + missing_path!r}); print('ok')"
    )
    assert run_python(code, mode=mode) == "ok"
    deadline = time.time() + 25
    while time.time() < deadline and psql(f"select storage_state from photos where id='{missing_id}'", mode=mode) != "missing":
        time.sleep(1)
    assert psql(f"select storage_state from photos where id='{missing_id}'", mode=mode) == "missing"
    assert api.client.get(f"/photos/{missing_id}/file").status_code == 404
    assert int(psql(f"select file_size_bytes from photos where id='{missing_id}'", mode=mode)) > 0
    assert api.delete(f"/photos/{missing_id}").status_code == 204
    record("S7 missing referenced S3 object", "detected without deleting metadata or quota bytes")


def main() -> int:
    build = subprocess.run(
        ["docker", "build", "-f", "docker/tests/Dockerfile.task-recovery", "-t", IMAGE, "."],
        cwd=ROOT,
        text=True,
    )
    if build.returncode:
        return build.returncode
    failed = False
    try:
        scope = os.getenv("RES005_MATRIX_SCOPE", "all")
        if scope in {"all", "local"}:
            run_local()
            checked(compose(["down", "-v", "--remove-orphans"], mode="local"))
        if scope in {"all", "s3"}:
            run_s3()
    except Exception as error:
        failed = True
        print(f"[res005] FAIL {type(error).__name__}: {error}", file=sys.stderr, flush=True)
    finally:
        compose(["down", "-v", "--remove-orphans"], mode="s3")
        subprocess.run(["docker", "image", "rm", IMAGE], cwd=ROOT, capture_output=True, text=True)
    print(f"[res005] SUMMARY {len(RESULTS)} passed", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
