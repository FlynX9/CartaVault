"""Reusable temporary-database isolation for Alembic migration tests."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL


BACKEND_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class MigrationTestEnvironment:
    """One Alembic environment backed by one disposable PostgreSQL database."""

    database_name: str
    engine: Engine
    config: Config

    @property
    def expected_heads(self) -> set[str]:
        return set(ScriptDirectory.from_config(self.config).get_heads())

    def current_heads(self) -> set[str]:
        with self.engine.connect() as connection:
            return set(MigrationContext.configure(connection).get_current_heads())

    def upgrade(self, revision: str) -> None:
        self._run("upgrade", revision)

    def downgrade(self, revision: str) -> None:
        self._run("downgrade", revision)

    def assert_at_head(self) -> None:
        assert self.current_heads() == self.expected_heads, (
            f"isolated migration database {self.database_name} is not at Alembic head: "
            f"current={sorted(self.current_heads())}, expected={sorted(self.expected_heads)}"
        )

    def _run(self, operation: str, target_revision: str) -> None:
        source_revisions = sorted(self.current_heads())
        try:
            getattr(command, operation)(self.config, target_revision)
        except Exception as caught:
            raise AssertionError(
                f"Alembic {operation} failed in isolated database {self.database_name}; "
                f"source={source_revisions or ['base']}, target={target_revision}"
            ) from caught


def _database_url(test_database_url: URL, database_name: str) -> URL:
    query = dict(test_database_url.query)
    query.pop("options", None)
    return test_database_url.set(database=database_name, query=query)


@contextmanager
def provision_migration_environment(
    test_database_url: URL,
    *,
    worker_id: str = "main",
) -> Generator[MigrationTestEnvironment, None, None]:
    """Create and always remove a unique database used only by one migration test."""

    safe_worker_id = "".join(character if character.isalnum() else "_" for character in worker_id.lower())[:12]
    database_name = f"cartavault_mig_{safe_worker_id}_{uuid4().hex}"
    administrative_url = _database_url(test_database_url, "postgres")
    administrative_engine = create_engine(administrative_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    with administrative_engine.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{database_name}" TEMPLATE template0'))

    engine = create_engine(_database_url(test_database_url, database_name), pool_pre_ping=True)
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.attributes["database_url"] = engine.url.render_as_string(hide_password=False)
    environment = MigrationTestEnvironment(database_name=database_name, engine=engine, config=config)

    try:
        yield environment
    finally:
        engine.dispose()
        try:
            with administrative_engine.connect() as connection:
                connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}" WITH (FORCE)'))
        finally:
            administrative_engine.dispose()
