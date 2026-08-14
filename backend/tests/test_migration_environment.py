import pytest
from alembic.runtime.migration import MigrationContext
from sqlalchemy import text

from tests import migration_environment as migration_environment_module
from tests.migration_environment import provision_migration_environment


pytestmark = pytest.mark.integration
BASELINE_REVISION = "9c74325a9837"


def _shared_heads(test_engine) -> set[str]:
    with test_engine.connect() as connection:
        return set(MigrationContext.configure(connection).get_current_heads())


def _database_exists(test_engine, database_name: str) -> bool:
    with test_engine.connect() as connection:
        return bool(connection.scalar(
            text("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = :database_name)"),
            {"database_name": database_name},
        ))


def test_migration_environments_are_sequentially_isolated(test_engine, test_database_url) -> None:
    shared_heads = _shared_heads(test_engine)
    database_names: list[str] = []

    for _ in range(2):
        with provision_migration_environment(test_database_url) as environment:
            database_names.append(environment.database_name)
            environment.upgrade(BASELINE_REVISION)
            assert environment.current_heads() == {BASELINE_REVISION}
            assert _shared_heads(test_engine) == shared_heads
        assert not _database_exists(test_engine, database_names[-1])

    assert database_names[0] != database_names[1]


def test_migration_environment_cleanup_survives_a_failed_assertion(test_engine, test_database_url) -> None:
    database_name = ""

    with pytest.raises(AssertionError, match="intentional migration assertion failure"):
        with provision_migration_environment(test_database_url) as environment:
            database_name = environment.database_name
            environment.upgrade(BASELINE_REVISION)
            raise AssertionError("intentional migration assertion failure")

    assert database_name
    assert not _database_exists(test_engine, database_name)


def test_migration_failure_reports_revisions_and_database(migration_environment, monkeypatch) -> None:
    migration_environment.upgrade(BASELINE_REVISION)

    def fail_upgrade(*_args, **_kwargs) -> None:
        raise RuntimeError("simulated Alembic failure")

    monkeypatch.setattr(migration_environment_module.command, "upgrade", fail_upgrade)
    with pytest.raises(AssertionError) as failure:
        migration_environment.upgrade("heads")

    message = str(failure.value)
    assert migration_environment.database_name in message
    assert f"source=['{BASELINE_REVISION}']" in message
    assert "target=heads" in message
    assert "@" not in message
