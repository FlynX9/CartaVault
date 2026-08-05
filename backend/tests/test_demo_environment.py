from __future__ import annotations

import importlib.util
import json
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


def test_french_demo_artwork_is_complete_and_versioned() -> None:
    assets = demo.validate_project_media_assets()
    assert [asset.name for asset in assets] == list(demo.EXPECTED_FRANCE_ASSETS)
    assert all(asset.suffix == ".webp" and asset.stat().st_size > 10_000 for asset in assets)
    assert set(demo.project_media_assets_by_fixture_id()) == {
        f"france-{index:02d}" for index in range(1, len(demo.PLACE_NAMES["france"]) + 1)
    }


def test_screenshot_manifest_covers_documentation_views() -> None:
    scenarios = json.loads((MODULE_PATH.parents[1] / "screenshots.json").read_text(encoding="utf-8"))
    scenario_ids = {scenario["id"] for scenario in scenarios}
    assert {
        "trip-france-fr-light",
        "timeline-france-fr-light",
        "media-fr-light",
        "account-profile-fr-light",
        "admin-users-fr-light",
    } <= scenario_ids


def test_demo_routes_include_the_previous_night_transition() -> None:
    previous_night_index = 4
    _, base_lat, base_lon = demo.REGIONS["france"][previous_night_index // 10]
    row, col = divmod(previous_night_index % 10, 5)
    assert (
        base_lat + (row - 0.5) * 0.14 + (col - 2) * 0.025,
        base_lon + (col - 2) * 0.12 + (row - 0.5) * 0.03,
    ) == pytest.approx((48.8366, 2.5772))


def test_french_demo_routes_use_precomputed_road_geometries() -> None:
    for key in ("france-short-1", "france-short-2"):
        route = demo.ROUTE_FIXTURES[key]
        assert route["distance_meters"] > 10_000
        assert route["duration_seconds"] > 1_000
        assert len(route["coordinates"]) > 100
