from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).resolve().parents[2] / "demo" / "scripts" / "manage.py"
SPEC = importlib.util.spec_from_file_location("cartavault_demo_manage", MODULE_PATH)
assert SPEC and SPEC.loader
demo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(demo)


def test_demo_guard_accepts_only_the_dedicated_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTAVAULT_DEMO_MODE", "true")
    demo.ensure_demo_target("postgresql+psycopg://demo:demo@postgis-demo:5432/cartavault_demo")


@pytest.mark.parametrize(
    ("mode", "url"),
    [
        ("false", "postgresql+psycopg://demo:demo@postgis-demo:5432/cartavault_demo"),
        ("true", "postgresql+psycopg://demo:demo@postgis-demo:5432/cartavault"),
        ("true", "postgresql+psycopg://demo:demo@production-db:5432/cartavault_demo"),
    ],
)
def test_demo_guard_rejects_unsafe_targets(monkeypatch: pytest.MonkeyPatch, mode: str, url: str) -> None:
    monkeypatch.setenv("CARTAVAULT_DEMO_MODE", mode)
    monkeypatch.delenv("CARTAVAULT_DEMO_DATABASE_HOSTS", raising=False)
    with pytest.raises(RuntimeError, match="Refusing reset"):
        demo.ensure_demo_target(url)


def test_stable_ids_are_repeatable_and_namespaced() -> None:
    assert demo.stable_id("place", "france-1") == demo.stable_id("place", "france-1")
    assert demo.stable_id("place", "france-1") != demo.stable_id("map", "france-1")
    assert len(demo.PLACE_NAMES["france"]) == len(demo.PLACE_NAMES["italy"]) == 30
