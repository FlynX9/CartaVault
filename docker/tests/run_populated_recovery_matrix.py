"""Real populated local, S3, and Redis backup/restore recovery matrix.

On Windows this runs Docker CLI from a Linux utility container so the
production POSIX scripts and host flock contract are exercised unchanged.
"""

from __future__ import annotations

import os
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "docker/tests/compose.s3-recovery.yml"
REDIS = ROOT / "docker/tests/compose.s3-recovery.redis.yml"
CLI_IMAGE = "docker:27-cli"
APP_IMAGE = "cartavault:1.0.0-rc.5-demo"


def docker_host_path(path: Path) -> str:
    resolved = path.resolve()
    if os.name != "nt":
        return str(resolved)
    drive = resolved.drive.rstrip(":").lower()
    suffix = resolved.as_posix().split(":", 1)[1]
    return f"/run/desktop/mnt/host/{drive}{suffix}"


ROOT_HOST = docker_host_path(ROOT)
WORK = Path(tempfile.gettempdir()) / "cartavault-populated-recovery"
WORK_HOST = docker_host_path(WORK)
BASE_HOST = f"{ROOT_HOST}/docker/tests/compose.s3-recovery.yml"
REDIS_HOST = f"{ROOT_HOST}/docker/tests/compose.s3-recovery.redis.yml"


def nested_command(arguments: list[str], environment: dict[str, str]) -> list[str]:
    command = [
        "docker", "run", "--rm",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", f"{ROOT}:{ROOT_HOST}",
        "-v", f"{WORK}:{WORK_HOST}",
        "-w", ROOT_HOST,
    ]
    for key, value in environment.items():
        command.extend(["-e", f"{key}={value}"])
    command.extend([CLI_IMAGE, *arguments])
    return command


class Scenario:
    def __init__(self, name: str, storage: str, redis: bool) -> None:
        self.name = name
        self.storage = storage
        self.redis = redis
        self.project = f"cartavault-recovery-{name}"
        self.directory = WORK / name / "backups"
        self.directory_host = f"{WORK_HOST}/{name}/backups"
        self.tmp_directory = WORK / name / "tmp"
        self.tmp_directory_host = f"{WORK_HOST}/{name}/tmp"
        self.environment = {"S3_TEST_MEDIA_STORAGE": storage, "S3_TEST_HTTP_PORT": "18089"}

    @property
    def compose_prefix(self) -> list[str]:
        command = ["docker", "compose", "--project-name", self.project, "-f", BASE_HOST]
        if self.redis:
            command.extend(["-f", REDIS_HOST])
        return command

    def run(self, arguments: list[str], *, timeout: int = 600, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            nested_command([*self.compose_prefix, *arguments], self.environment),
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    def script_command(self, script: str, arguments: list[str], extra: dict[str, str] | None = None) -> list[str]:
        environment = dict(self.environment)
        environment.update(
            {
                "CARTAVAULT_COMPOSE_FILE": BASE_HOST,
                "CARTAVAULT_COMPOSE_PROJECT": self.project,
                "CARTAVAULT_OPERATION_LOCK_ROOT": f"{self.tmp_directory_host}/operation-locks",
                "TMPDIR": self.tmp_directory_host,
                **(extra or {}),
            }
        )
        command = [
            "sh", "-c",
            f"apk add --no-cache util-linux >/dev/null && exec sh {ROOT_HOST}/docker/{script} \"$@\"",
            "sh", *arguments,
        ]
        return nested_command(command, environment)

    def script(self, script: str, arguments: list[str], extra: dict[str, str] | None = None, *, check: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            self.script_command(script, arguments, extra),
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=900,
            check=False,
        )
        if check and result.returncode:
            raise RuntimeError(result.stderr or result.stdout)
        return result

    def sql(self, statement: str) -> str:
        return self.run(
            ["exec", "-T", "postgis", "psql", "-U", "cartavault_demo", "-d", "cartavault_demo", "-Atc", statement]
        ).stdout.strip()

    def start(self) -> None:
        self.run(["up", "-d"], timeout=600)
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            reset_id = self.run(["ps", "-a", "-q", "demo-reset"], check=False).stdout.strip()
            if reset_id:
                state = subprocess.run(
                    nested_command(["docker", "inspect", "--format", "{{.State.Status}} {{.State.ExitCode}}", reset_id], self.environment),
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    check=False,
                ).stdout.strip()
                if state == "exited 0":
                    break
                if state.startswith("exited "):
                    raise RuntimeError(f"{self.name}: demo reset failed: {state}")
            time.sleep(1)
        else:
            raise RuntimeError(f"{self.name}: demo reset did not complete")
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            ready = self.run(
                ["exec", "-T", "cartavault", "python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health/ready', timeout=3)"],
                check=False,
            )
            if ready.returncode == 0:
                return
            time.sleep(1)
        raise RuntimeError(f"{self.name}: API did not become ready")

    def app_python(self, code: str) -> str:
        return self.run(["exec", "-T", "cartavault", "python", "-c", code]).stdout.strip()

    def seed(self) -> None:
        self.sql(
            "CREATE TABLE operations_recovery_marker (id integer primary key, payload text not null, activity integer not null default 0);"
            "INSERT INTO operations_recovery_marker (id, payload) VALUES (1, 'backup-state')"
        )
        self.run(
            ["exec", "-T", "cartavault", "sh", "-c", "printf local-photo-state > /app/storage/photos/recovery-photo.bin; printf avatar-state > /app/storage/avatars/recovery-avatar.bin; printf export-state > /app/storage/exports/recovery-export.bin"]
        )
        if self.storage == "s3":
            references = self.sql(
                "SELECT path || '|' || COALESCE(file_size_bytes::text, '') FROM photos WHERE path IS NOT NULL "
                "UNION ALL SELECT file_path || '|' || file_size_bytes::text FROM trip_night_photos ORDER BY 1"
            ).splitlines()
            self.app_python(
                "import boto3,os; from botocore.client import Config; "
                "c=boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT'],region_name=os.environ['S3_REGION'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'],config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); "
                f"refs={json.dumps(references)!r}; import json; refs=json.loads(refs); "
                "[(lambda p,s: c.put_object(Bucket=os.environ['S3_BUCKET'],Key='carta-media/'+p,Body=b'x'*int(s or 0),ContentType='application/octet-stream'))(*r.split('|',1)) for r in refs]; "
                "c.put_object(Bucket=os.environ['S3_BUCKET'],Key='carta-media/recovery-photo.bin',Body=b's3-photo-state'); "
                "c.put_object(Bucket=os.environ['S3_BUCKET'],Key='outside-prefix/preserve.bin',Body=b'outside-state')"
            )
        if self.redis:
            self.run(
                ["exec", "-d", "worker", "python", "-c", "import os,time,psycopg; d=os.environ['DATABASE_URL'].replace('+psycopg','');\nwhile True:\n c=psycopg.connect(d); c.execute('update operations_recovery_marker set activity=activity+1 where id=1'); c.commit(); c.close(); time.sleep(.1)"]
            )
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and self.sql("select activity > 0 from operations_recovery_marker") != "t":
                time.sleep(0.2)
            if self.sql("select activity > 0 from operations_recovery_marker") != "t":
                raise RuntimeError("Redis worker activity was not observed")

    def mutate(self, payload: str) -> None:
        self.sql(f"update operations_recovery_marker set payload='{payload}' where id=1")
        self.run(
            ["exec", "-T", "cartavault", "sh", "-c", "printf live-mutated > /app/storage/photos/recovery-photo.bin; printf avatar-mutated > /app/storage/avatars/recovery-avatar.bin; printf extra > /app/storage/photos/after-backup.bin"]
        )
        if self.storage == "s3":
            self.app_python(
                "import boto3,os; from botocore.client import Config; "
                "c=boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT'],region_name=os.environ['S3_REGION'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'],config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); "
                "c.put_object(Bucket=os.environ['S3_BUCKET'],Key='carta-media/recovery-photo.bin',Body=b's3-mutated'); "
                "c.put_object(Bucket=os.environ['S3_BUCKET'],Key='carta-media/after-backup.bin',Body=b'extra')"
            )

    def verify(self) -> None:
        if self.sql("select payload from operations_recovery_marker where id=1") != "backup-state":
            raise RuntimeError(f"{self.name}: database did not round-trip")
        local = self.run(["exec", "-T", "cartavault", "cat", "/app/storage/avatars/recovery-avatar.bin"])
        if local.stdout != "avatar-state":
            raise RuntimeError(f"{self.name}: local media did not round-trip")
        if self.storage == "local":
            self.run(["exec", "-T", "cartavault", "test", "!", "-e", "/app/storage/photos/after-backup.bin"])
            photo = self.run(["exec", "-T", "cartavault", "cat", "/app/storage/photos/recovery-photo.bin"]).stdout
            if photo != "local-photo-state":
                raise RuntimeError(f"{self.name}: photo volume did not round-trip")
        else:
            result = self.app_python(
                "import boto3,os; from botocore.client import Config; "
                "c=boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT'],region_name=os.environ['S3_REGION'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'],config=Config(signature_version='s3v4',s3={'addressing_style':'path'})); b=os.environ['S3_BUCKET']; "
                "inside=c.get_object(Bucket=b,Key='carta-media/recovery-photo.bin')['Body'].read(); outside=c.get_object(Bucket=b,Key='outside-prefix/preserve.bin')['Body'].read(); "
                "keys=[x['Key'] for x in c.list_objects_v2(Bucket=b,Prefix='carta-media/').get('Contents',[])]; print(inside.decode(),outside.decode(),int('carta-media/after-backup.bin' in keys))"
            )
            if result != "s3-photo-state outside-state 0":
                raise RuntimeError(f"{self.name}: S3 prefix/outside-prefix contract failed: {result}")

    def verify_actual_overlaps(self, backup: Path) -> None:
        paused_backup = subprocess.Popen(
            self.script_command(
                "backup.sh",
                [self.directory_host],
                {
                    "CARTAVAULT_BACKUP_TESTING": "true",
                    "CARTAVAULT_BACKUP_TEST_PAUSE_AT": "capture_complete",
                    "CARTAVAULT_BACKUP_TEST_PAUSE_SECONDS": "30",
                },
            ),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        time.sleep(8)
        if paused_backup.poll() is not None:
            stdout, stderr = paused_backup.communicate()
            raise RuntimeError(f"paused backup exited early: {stdout}\n{stderr}")
        overlapping_backup = self.script("backup.sh", [self.directory_host], check=False)
        if overlapping_backup.returncode == 0 or "another CartaVault backup/restore operation already owns" not in overlapping_backup.stderr:
            raise RuntimeError("actual backup-vs-backup overlap was not rejected")
        overlapping_restore = self.script(
            "restore.sh",
            [f"{self.directory_host}/{backup.name}"],
            {"CARTAVAULT_RESTORE_CONFIRM": "restore"},
            check=False,
        )
        if overlapping_restore.returncode == 0 or "another CartaVault backup/restore operation already owns" not in overlapping_restore.stderr:
            raise RuntimeError("actual backup-vs-restore overlap was not rejected")
        stdout, stderr = paused_backup.communicate(timeout=300)
        if paused_backup.returncode:
            raise RuntimeError(f"paused backup failed after overlap checks: {stdout}\n{stderr}")

        paused_restore = subprocess.Popen(
            self.script_command(
                "restore.sh",
                [f"{self.directory_host}/{backup.name}"],
                {
                    "CARTAVAULT_RESTORE_CONFIRM": "restore",
                    "CARTAVAULT_RESTORE_TESTING": "true",
                    "CARTAVAULT_RESTORE_TEST_PAUSE_AT": "staging_validated",
                    "CARTAVAULT_RESTORE_TEST_PAUSE_SECONDS": "30",
                },
            ),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        time.sleep(8)
        if paused_restore.poll() is not None:
            stdout, stderr = paused_restore.communicate()
            raise RuntimeError(f"paused restore exited early: {stdout}\n{stderr}")
        overlapping_restore = self.script(
            "restore.sh",
            [f"{self.directory_host}/{backup.name}"],
            {"CARTAVAULT_RESTORE_CONFIRM": "restore"},
            check=False,
        )
        if overlapping_restore.returncode == 0 or "another CartaVault backup/restore operation already owns" not in overlapping_restore.stderr:
            raise RuntimeError("actual restore-vs-restore overlap was not rejected")
        stdout, stderr = paused_restore.communicate(timeout=600)
        if paused_restore.returncode:
            raise RuntimeError(f"paused restore failed after overlap check: {stdout}\n{stderr}")
        print("[populated-recovery] PASS actual backup/restore overlap matrix 3/3", flush=True)


def run_scenario(scenario: Scenario) -> None:
    print(f"[populated-recovery] START {scenario.name}", flush=True)
    scenario.run(["down", "--volumes", "--remove-orphans"], check=False)
    shutil.rmtree(scenario.directory, ignore_errors=True)
    scenario.directory.mkdir(parents=True)
    shutil.rmtree(scenario.tmp_directory, ignore_errors=True)
    scenario.tmp_directory.mkdir(parents=True)
    try:
        scenario.start()
        scenario.seed()
        backup = scenario.script(
            "backup.sh", [scenario.directory_host], {"CARTAVAULT_BACKUP_EXPORTS": "true"}
        )
        if "[writers] Stopping writer service: worker" in backup.stdout:
            if backup.stdout.index("worker") > backup.stdout.index("Stopping writer service: cartavault"):
                raise RuntimeError("worker was not stopped before API during populated backup")
        backups = sorted(path for path in scenario.directory.iterdir() if path.is_dir())
        if len(backups) != 1 or not (backups[0] / "COMPLETED").is_file():
            raise RuntimeError(f"{scenario.name}: completed recovery set was not published")
        if scenario.name == "local":
            orphan_database = "cvrs_cartavault_demo_s_orphan"
            scenario.run(["exec", "-T", "postgis", "createdb", "-U", "cartavault_demo", orphan_database])
            rejected = scenario.script("backup.sh", [scenario.directory_host], check=False)
            scenario.run(["exec", "-T", "postgis", "dropdb", "-U", "cartavault_demo", orphan_database])
            if rejected.returncode == 0 or "leftover restore database/media artifacts" not in rejected.stderr:
                raise RuntimeError("backup accepted ambiguous interrupted-restore artifacts")
            if len([path for path in scenario.directory.iterdir() if path.is_dir()]) != 1:
                raise RuntimeError("restore-artifact rejection created a partial backup directory")
            print("[populated-recovery] PASS interrupted-restore artifacts block backup before publication", flush=True)
        if scenario.redis:
            scenario.verify_actual_overlaps(backups[0])
        scenario.mutate("live-before-restore")

        if scenario.redis:
            failed = scenario.script(
                "restore.sh",
                [f"{scenario.directory_host}/{backups[0].name}"],
                {
                    "CARTAVAULT_RESTORE_CONFIRM": "restore",
                    "CARTAVAULT_RESTORE_TESTING": "true",
                    "CARTAVAULT_QUIESCE_TEST_FAIL_SERVICE": "worker",
                    "CARTAVAULT_QUIESCE_TEST_FAIL_CONTEXT": "cutover",
                },
                check=False,
            )
            if failed.returncode == 0:
                raise RuntimeError("injected Redis worker-stop restore unexpectedly succeeded")
            if scenario.sql("select payload from operations_recovery_marker where id=1") != "live-before-restore":
                raise RuntimeError("failed Redis cutover barrier mutated the live database")

        if scenario.name == "local":
            scenario.run(["rm", "-sf", "cartavault"])
        scenario.script(
            "restore.sh",
            [f"{scenario.directory_host}/{backups[0].name}"],
            {"CARTAVAULT_RESTORE_CONFIRM": "restore"},
        )
        scenario.verify()
        print(f"[populated-recovery] PASS {scenario.name}", flush=True)
    finally:
        scenario.run(["down", "--volumes", "--remove-orphans"], check=False)


def main() -> int:
    if subprocess.run(["docker", "image", "inspect", APP_IMAGE], capture_output=True).returncode:
        raise RuntimeError(f"required disposable image is missing: {APP_IMAGE}")
    WORK.mkdir(parents=True, exist_ok=True)
    scenarios = [
        Scenario("local", "local", False),
        Scenario("s3", "s3", False),
        Scenario("redis", "local", True),
    ]
    for scenario in scenarios:
        run_scenario(scenario)
    print(f"[populated-recovery] SUMMARY {len(scenarios)}/{len(scenarios)} passed", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
