from __future__ import annotations

import re
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
DOCKER = ROOT / "docker"


def _service_names(path: Path) -> set[str]:
    """Read only the top-level Compose service keys without a YAML dependency."""

    services: set[str] = set()
    inside_services = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line == "services:":
            inside_services = True
            continue
        if inside_services and line and not line.startswith((" ", "#")):
            break
        if inside_services and (match := re.fullmatch(r"  ([a-z0-9_-]+):", line)):
            services.add(match.group(1))
    return services


@pytest.mark.unit
@pytest.mark.parametrize("filename", ["compose.yml", "compose.portainer.yml"])
def test_standard_compose_has_only_application_and_postgis(filename: str) -> None:
    compose = (DOCKER / filename).read_text(encoding="utf-8")

    assert _service_names(DOCKER / filename) == {"cartavault", "postgis"}
    assert "CARTAVAULT_TASK_MODE: sync" in compose
    assert "REDIS_URL:" not in compose
    assert "redis_data:" not in compose


@pytest.mark.unit
@pytest.mark.parametrize(
    "filename", ["compose.redis.yml", "compose.portainer.redis.yml"]
)
def test_redis_and_worker_are_explicit_optional_extensions(filename: str) -> None:
    compose = (DOCKER / filename).read_text(encoding="utf-8")

    assert _service_names(DOCKER / filename) == {"cartavault", "redis", "worker"}
    assert "CARTAVAULT_TASK_MODE: redis" in compose
    assert "app.tasks.worker" in compose


@pytest.mark.unit
def test_external_database_compose_keeps_one_application_service() -> None:
    assert _service_names(DOCKER / "compose.external.yml") == {"cartavault"}


@pytest.mark.unit
def test_unified_image_contains_both_runtimes_and_one_entrypoint() -> None:
    dockerfile = (DOCKER / "Dockerfile").read_text(encoding="utf-8")

    assert "FROM node:" in dockerfile
    assert "FROM python:" in dockerfile
    assert "COPY --from=frontend-builder" in dockerfile
    assert 'ENTRYPOINT ["python", "-m", "app.container_entrypoint"]' in dockerfile
