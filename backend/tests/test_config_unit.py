from __future__ import annotations

import pytest

from app.config import S3Settings, VectorBasemapSettings, _boolean


pytestmark = pytest.mark.unit


@pytest.mark.parametrize("value", ["1", "true", "YES", " on "])
def test_boolean_accepts_explicit_true_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("CARTAVAULT_TEST_BOOLEAN", value)

    assert _boolean("CARTAVAULT_TEST_BOOLEAN", False) is True


@pytest.mark.parametrize("value", ["0", "false", "NO", " off "])
def test_boolean_accepts_explicit_false_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("CARTAVAULT_TEST_BOOLEAN", value)

    assert _boolean("CARTAVAULT_TEST_BOOLEAN", True) is False


def test_boolean_rejects_ambiguous_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTAVAULT_TEST_BOOLEAN", "ture")

    with pytest.raises(RuntimeError, match="must be a boolean"):
        _boolean("CARTAVAULT_TEST_BOOLEAN", True)


def test_external_io_settings_have_finite_defaults() -> None:
    s3 = S3Settings()
    vector = VectorBasemapSettings()

    assert s3.connect_timeout_seconds > 0
    assert s3.read_timeout_seconds > 0
    assert s3.max_attempts > 0
    assert s3.operation_timeout_seconds > 0
    assert vector.planetiler_timeout_seconds > 0


def test_s3_retry_mode_rejects_unbounded_legacy_mode() -> None:
    with pytest.raises(RuntimeError, match="S3_RETRY_MODE"):
        S3Settings(retry_mode="legacy")
