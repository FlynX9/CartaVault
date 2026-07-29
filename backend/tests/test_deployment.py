from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import deployment


class FakeResultConnection:
    def __init__(self, lock_results: list[bool] | None = None) -> None:
        self.lock_results = list(lock_results or [])
        self.closed = False
        self.executed: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def execute(self, statement, _parameters=None):
        self.executed.append(str(statement))
        return SimpleNamespace()

    def scalar(self, statement, _parameters=None):
        self.executed.append(str(statement))
        return self.lock_results.pop(0)

    def close(self) -> None:
        self.closed = True


class FakeEngine:
    def __init__(self, connections: list[FakeResultConnection]) -> None:
        self.connections = list(connections)
        self.disposed = False

    def connect(self):
        return self.connections.pop(0)

    def dispose(self) -> None:
        self.disposed = True


@pytest.mark.unit
def test_database_target_never_contains_credentials() -> None:
    target = deployment._database_target(
        "postgresql+psycopg://cartavault:super-secret@postgres:5432/cartavault"
    )

    assert target == "postgres:5432/cartavault"
    assert "super-secret" not in target
    assert "cartavault@" not in target


@pytest.mark.unit
def test_wait_for_database_requires_consecutive_successes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = FakeEngine(
        [
            FakeResultConnection(),
            FakeResultConnection(),
            FakeResultConnection(),
        ]
    )

    deployment.wait_for_database(
        engine,
        timeout_seconds=5,
        stable_checks=3,
        interval_seconds=0,
        sleep=lambda _seconds: None,
    )

    assert engine.connections == []


@pytest.mark.unit
def test_migration_lock_waits_and_is_released() -> None:
    lock_connection = FakeResultConnection([False, True])
    engine = FakeEngine([lock_connection])

    acquired = deployment.acquire_migration_lock(
        engine,
        timeout_seconds=5,
        interval_seconds=0,
        sleep=lambda _seconds: None,
    )
    deployment.release_migration_lock(acquired)

    assert lock_connection.closed is True
    assert any("pg_advisory_unlock" in statement for statement in lock_connection.executed)


@pytest.mark.unit
def test_migrate_and_bootstrap_reports_distinct_phases_without_secrets(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    readiness_connection = FakeResultConnection()
    lock_connection = FakeResultConnection([True])
    engine = FakeEngine([readiness_connection, lock_connection])
    events: list[str] = []
    secret = "never-print-this-password"

    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql+psycopg://cartavault:{secret}@postgres:5432/cartavault",
    )
    monkeypatch.setenv("CARTAVAULT_DATABASE_STABLE_CHECKS", "1")
    monkeypatch.setattr(deployment, "create_engine", lambda *_args, **_kwargs: engine)
    monkeypatch.setattr(
        deployment,
        "prepare_administrator_schema",
        lambda _engine: events.append("prepare"),
    )
    monkeypatch.setattr(
        deployment,
        "run_alembic_upgrade",
        lambda: events.append("migration"),
    )
    monkeypatch.setattr(
        deployment,
        "run_administrator_bootstrap",
        lambda: events.append("bootstrap"),
    )

    assert deployment.migrate_and_bootstrap() == 0

    output = capsys.readouterr()
    assert events == ["prepare", "bootstrap", "migration", "bootstrap"]
    assert "[readiness]" in output.out
    assert "[lock]" in output.out
    assert "[complete]" in output.out
    assert secret not in output.out
    assert secret not in output.err
    assert engine.disposed is True


@pytest.mark.unit
def test_migrate_and_bootstrap_stops_before_migration_when_database_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    engine = FakeEngine([])
    secret = "never-print-this-password"

    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql+psycopg://cartavault:{secret}@postgres:5432/cartavault",
    )
    monkeypatch.setattr(deployment, "create_engine", lambda *_args, **_kwargs: engine)
    monkeypatch.setattr(
        deployment,
        "wait_for_database",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            deployment.DeploymentError("PostgreSQL unavailable.")
        ),
    )
    monkeypatch.setattr(
        deployment,
        "run_alembic_upgrade",
        lambda: pytest.fail("migration must not run"),
    )

    assert deployment.migrate_and_bootstrap() == 1
    output = capsys.readouterr()
    assert "[failure] PostgreSQL unavailable." in output.err
    assert secret not in output.err
