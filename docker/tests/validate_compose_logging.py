"""Validate bounded effective logging for every supported production stack."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MATRIX = {
    "standard": (["docker/compose.yml"], {"postgis", "cartavault"}),
    "standard-redis": (
        ["docker/compose.yml", "docker/compose.redis.yml"],
        {"postgis", "cartavault", "redis", "worker"},
    ),
    "portainer": (["docker/compose.portainer.yml"], {"postgis", "cartavault"}),
    "portainer-redis": (
        ["docker/compose.portainer.yml", "docker/compose.portainer.redis.yml"],
        {"postgis", "cartavault", "redis", "worker"},
    ),
    "external-postgres": (["docker/compose.external.yml"], {"cartavault"}),
    "saas": (["docker/compose.saas.yml"], {"nginx", "postgis", "cartavault"}),
}


def environment() -> dict[str, str]:
    values = os.environ.copy()
    values.update(
        {
            "DATABASE_URL": "postgresql+psycopg://user:pass@postgis:5432/app",
            "CARTAVAULT_VERSION": "test",
            "CARTAVAULT_IMAGE": "cartavault",
            "CARTAVAULT_HOSTNAME": "cartavault.example.test",
            "FRONTEND_PUBLIC_URL": "https://cartavault.example.test",
            "CORS_ALLOWED_ORIGINS": "https://cartavault.example.test",
            "CARTAVAULT_SESSION_SECRET": "synthetic-session-secret",
            "CARTAVAULT_SETUP_TOKEN": "synthetic-setup-token",
            "CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "EMAIL_FROM_ADDRESS": "test@example.test",
            "POSTGRES_DB": "app",
            "POSTGRES_USER": "user",
            "POSTGRES_PASSWORD": "pass",
            "REDIS_PASSWORD": "synthetic-redis-password",
            "S3_BUCKET": "synthetic-bucket",
            "S3_ACCESS_KEY": "synthetic-access",
            "S3_SECRET_KEY": "synthetic-secret",
        }
    )
    return values


def main() -> int:
    for name, (files, expected) in MATRIX.items():
        command = ["docker", "compose"]
        for file in files:
            command.extend(["-f", str(ROOT / file)])
        command.extend(["config", "--format", "json"])
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=environment(),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"{name} compose config failed: {result.stderr}")
        services = json.loads(result.stdout)["services"]
        if set(services) != expected:
            raise RuntimeError(f"{name} service mismatch: {sorted(services)}")
        for service in expected:
            logging = services[service].get("logging", {})
            options = logging.get("options", {})
            if logging.get("driver") != "json-file" or options.get("max-size") != "10m" or str(options.get("max-file")) != "5":
                raise RuntimeError(f"{name}/{service} logging is not bounded: {logging}")
        print(f"[compose-logging] PASS {name}: {', '.join(sorted(expected))}", flush=True)
    print(f"[compose-logging] SUMMARY {len(MATRIX)}/{len(MATRIX)} passed", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
