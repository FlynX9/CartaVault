from types import SimpleNamespace
from datetime import UTC, datetime

import pytest

from app.instance_status import service


pytestmark = pytest.mark.unit


def _components(**statuses: str) -> SimpleNamespace:
    defaults = {
        "application": "operational", "resources": "operational", "database": "operational", "storage": "operational",
        "usage": "operational", "authentication": "operational", "https": "unknown",
        "email": "operational", "mapping": "operational", "routing": "operational",
        "maintenance": "operational", "backups": "unknown", "security": "operational",
    }
    defaults.update(statuses)
    result = SimpleNamespace(**{name: SimpleNamespace(status=value) for name, value in defaults.items()})
    result.model_fields = {name: object() for name in defaults}
    return result


@pytest.mark.parametrize(
    ("statuses", "expected"),
    [
        ({}, "operational"),
        ({"routing": "unavailable"}, "degraded"),
        ({"database": "unavailable"}, "unavailable"),
        ({"application": "misconfigured"}, "misconfigured"),
        ({"security": "misconfigured"}, "misconfigured"),
    ],
)
def test_global_status_aggregation_is_deterministic(statuses, expected) -> None:
    assert service._aggregate(_components(**statuses)) == expected


def test_instance_status_cache_and_forced_refresh(monkeypatch) -> None:
    service.clear_instance_status_cache()
    results = [object(), object()]
    calls = 0

    def collect(_session, _request):
        nonlocal calls
        result = results[calls]
        calls += 1
        return result

    monkeypatch.setattr(service, "collect_instance_status", collect)

    first = service.get_instance_status(object(), object())
    cached = service.get_instance_status(object(), object())
    refreshed = service.get_instance_status(object(), object(), force=True)

    assert first is cached
    assert refreshed is results[1]
    assert calls == 2
    service.clear_instance_status_cache()


def test_environment_boolean_parser(monkeypatch) -> None:
    monkeypatch.setenv("INSTANCE_TEST_BOOLEAN", "true")
    assert service._env_bool("INSTANCE_TEST_BOOLEAN") is True
    monkeypatch.setenv("INSTANCE_TEST_BOOLEAN", "off")
    assert service._env_bool("INSTANCE_TEST_BOOLEAN") is False


def test_runtime_resources_use_container_cgroup_limits(monkeypatch, tmp_path) -> None:
    (tmp_path / "cpu.stat").write_text("usage_usec 1000000\n", encoding="ascii")
    (tmp_path / "cpu.max").write_text("100000 100000\n", encoding="ascii")
    (tmp_path / "memory.current").write_text(str(256 * 1024 * 1024), encoding="ascii")
    (tmp_path / "memory.max").write_text(str(512 * 1024 * 1024), encoding="ascii")
    monkeypatch.setenv("CARTAVAULT_CGROUP_ROOT", str(tmp_path))
    monkeypatch.setenv("WEB_CONCURRENCY", "3")
    samples = iter((10.0, 11.0))
    monkeypatch.setattr(service, "monotonic", lambda: next(samples))
    monkeypatch.setattr(service, "_cpu_sample", None)

    first = service._runtime_resources(datetime.now(UTC))
    (tmp_path / "cpu.stat").write_text("usage_usec 1500000\n", encoding="ascii")
    second = service._runtime_resources(datetime.now(UTC))

    assert first.cpu_percent is None
    assert second.cpu_percent == 50.0
    assert second.cpu_limit_cores == 1.0
    assert second.memory_percent == 50.0
    assert second.worker_count == 3
    assert second.cpu_scope == "container-cgroup"


def test_runtime_resources_report_unavailable_without_supported_metrics(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CARTAVAULT_CGROUP_ROOT", str(tmp_path))
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.delenv("CARTAVAULT_WORKERS", raising=False)
    monkeypatch.setattr(service, "_cpu_sample", None)
    monkeypatch.setattr(service, "psutil", None)

    resources = service._runtime_resources(datetime.now(UTC))

    assert resources.status == "unknown"
    assert resources.cpu_scope == "unavailable"
    assert resources.memory_scope == "unavailable"
    assert resources.worker_count is None


def test_runtime_resources_use_host_metrics_without_cgroups(monkeypatch, tmp_path) -> None:
    memory = SimpleNamespace(total=16 * 1024**3, available=10 * 1024**3, percent=37.5)
    host_metrics = SimpleNamespace(
        cpu_percent=lambda interval: 12.5 if interval == 0.05 else 0,
        cpu_count=lambda: 8,
        virtual_memory=lambda: memory,
    )
    monkeypatch.setenv("CARTAVAULT_CGROUP_ROOT", str(tmp_path))
    monkeypatch.setattr(service, "psutil", host_metrics)
    monkeypatch.setattr(service, "_cpu_sample", None)

    resources = service._runtime_resources(datetime.now(UTC))

    assert resources.status == "operational"
    assert resources.cpu_percent == 12.5
    assert resources.cpu_limit_cores == 8
    assert resources.cpu_scope == "host-system"
    assert resources.memory_used_bytes == 6 * 1024**3
    assert resources.memory_limit_bytes == 16 * 1024**3
    assert resources.memory_percent == 37.5
    assert resources.memory_scope == "host-system"
