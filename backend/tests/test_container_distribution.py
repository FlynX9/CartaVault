from __future__ import annotations

import re
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
DOCKER = ROOT / "docker"
WORKFLOWS = ROOT / ".github" / "workflows"


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


@pytest.mark.unit
def test_public_image_inputs_and_runtime_dependencies_are_release_safe() -> None:
    dockerfile = (DOCKER / "Dockerfile").read_text(encoding="utf-8")
    runtime_requirements = (ROOT / "backend" / "requirements.txt").read_text(
        encoding="utf-8"
    )
    dev_requirements = (ROOT / "backend" / "requirements-dev.txt").read_text(
        encoding="utf-8"
    )

    assert dockerfile.count("FROM python:3.14-slim-trixie@sha256:") == 2
    assert "FROM node:24-alpine@sha256:" in dockerfile
    assert "org.opencontainers.image.source" in dockerfile
    assert "pytest==" not in runtime_requirements
    assert "-r requirements.txt" in dev_requirements
    assert "pytest==" in dev_requirements


@pytest.mark.unit
def test_public_release_workflow_publishes_verified_amd64_image() -> None:
    workflow = (WORKFLOWS / "release-container.yml").read_text(encoding="utf-8")

    assert "release:" in workflow
    assert "types: [published]" in workflow
    assert "packages: write" in workflow
    assert "attestations: write" in workflow
    assert "IMAGE_NAME: flynx9/cartavault" in workflow
    assert "platforms: linux/amd64" in workflow
    assert "--severity CRITICAL" in workflow
    assert "provenance: mode=max" in workflow
    assert "sbom: true" in workflow
    assert "push-to-registry: true" in workflow
    assert '"import app, importlib.util;' in workflow
    assert "import app.main" not in workflow


@pytest.mark.unit
def test_portainer_defaults_to_the_public_ghcr_image() -> None:
    compose = (DOCKER / "compose.portainer.yml").read_text(encoding="utf-8")

    assert "${CARTAVAULT_IMAGE:-ghcr.io/flynx9/cartavault}" in compose
