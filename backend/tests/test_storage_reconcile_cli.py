from __future__ import annotations

import json

import pytest

from app.cli import storage_reconcile


pytestmark = pytest.mark.unit


class FakeSession:
    rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def rollback(self) -> None:
        self.rolled_back = True


def test_storage_reconcile_cli_defaults_to_dry_run(monkeypatch, capsys) -> None:
    session = FakeSession()
    monkeypatch.setattr("app.cli.SessionLocal", lambda: session)

    def fake_reconcile(received, *, repair, grace_seconds):
        assert received is session
        assert repair is False
        assert grace_seconds is None
        return {"mode": "dry-run", "backend_errors": [], "missing_references": []}

    monkeypatch.setattr("app.cli.deep_reconcile_storage", fake_reconcile)
    assert storage_reconcile() == 0
    assert session.rolled_back
    assert json.loads(capsys.readouterr().out)["mode"] == "dry-run"


def test_storage_reconcile_cli_fails_when_repair_delete_remains_pending(monkeypatch, capsys) -> None:
    session = FakeSession()
    monkeypatch.setattr("app.cli.SessionLocal", lambda: session)
    monkeypatch.setattr(
        "app.cli.deep_reconcile_storage",
        lambda *_args, **_kwargs: {
            "mode": "repair",
            "backend_errors": [{"code": "STORAGE_DELETE_FAILED"}],
        },
    )

    assert storage_reconcile(repair=True) == 1
    assert json.loads(capsys.readouterr().out)["backend_errors"]
