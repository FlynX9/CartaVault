from types import SimpleNamespace

import pytest

from app.trips.service import DAY_COLOR_PALETTE, next_day_color


pytestmark = pytest.mark.unit


def test_next_day_color_uses_an_unused_contrasting_palette_color() -> None:
    days = [SimpleNamespace(color=color) for color in DAY_COLOR_PALETTE[:3]]

    assert next_day_color(days) == DAY_COLOR_PALETTE[3]


def test_next_day_color_normalizes_existing_color_case() -> None:
    assert next_day_color([SimpleNamespace(color="#0fa68a")]) == DAY_COLOR_PALETTE[1]
