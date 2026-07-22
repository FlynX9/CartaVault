from types import SimpleNamespace

import pytest

from app.instance_status import service


pytestmark = pytest.mark.unit


def _components(**statuses: str) -> SimpleNamespace:
    defaults = {
        "application": "operational", "database": "operational", "storage": "operational",
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
