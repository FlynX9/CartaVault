from __future__ import annotations

import pytest

from app.config import _boolean


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
