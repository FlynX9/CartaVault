from __future__ import annotations

import pytest

from app.main import get_cors_allowed_origins


pytestmark = pytest.mark.unit


def test_cors_origins_are_normalized_and_deduplicated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS",
        " https://cartavault.example/ ,https://cartavault.example,http://localhost:5173 ",
    )

    assert get_cors_allowed_origins() == [
        "https://cartavault.example",
        "http://localhost:5173",
    ]


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "javascript:alert(1)",
        "https://user:password@cartavault.example",
        "https://cartavault.example/path",
    ],
)
def test_cors_origins_reject_unsafe_values(monkeypatch: pytest.MonkeyPatch, origin: str) -> None:
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", origin)

    with pytest.raises(RuntimeError, match="Invalid CORS origin"):
        get_cors_allowed_origins()
