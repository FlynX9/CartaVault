"""Deterministic one-shot database migration and administrator bootstrap.

This module is intentionally independent from the FastAPI startup lifecycle.
It is run by a version-matched deployment job before a backend container is
allowed to start.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Callable
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError


BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATION_LOCK_NAME = "cartavault:v1-schema-migration"


class DeploymentError(RuntimeError):
    """Controlled deployment failure with a safe, user-facing diagnostic."""


def _positive_int_environment(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as error:
        raise DeploymentError(f"{name} must be an integer.") from error
    if value <= 0:
        raise DeploymentError(f"{name} must be greater than zero.")
    return value


def _database_target(database_url: str) -> str:
    parsed = make_url(database_url)
    host = parsed.host or "local socket"
    port = f":{parsed.port}" if parsed.port else ""
    database = parsed.database or "<unspecified>"
    return f"{host}{port}/{database}"


def wait_for_database(
    engine: Engine,
    *,
    timeout_seconds: int,
    stable_checks: int,
    interval_seconds: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Wait until PostgreSQL succeeds repeatedly, avoiding init-server races."""

    deadline = time.monotonic() + timeout_seconds
    consecutive_successes = 0
    attempt = 0
    last_error: str | None = None

    while time.monotonic() < deadline:
        attempt += 1
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            consecutive_successes += 1
            print(
                "[readiness] PostgreSQL connection succeeded "
                f"({consecutive_successes}/{stable_checks})."
            )
            if consecutive_successes >= stable_checks:
                print("[readiness] PostgreSQL is stable.")
                return
        except SQLAlchemyError as error:
            consecutive_successes = 0
            last_error = error.__class__.__name__
            print(
                f"[readiness] PostgreSQL is not ready (attempt {attempt}, {last_error})."
            )
        sleep(interval_seconds)

    suffix = f" Last error: {last_error}." if last_error else ""
    raise DeploymentError(
        f"PostgreSQL did not become stable within {timeout_seconds} seconds.{suffix}"
    )


def acquire_migration_lock(
    engine: Engine,
    *,
    timeout_seconds: int,
    interval_seconds: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
):
    """Acquire one session-level PostgreSQL advisory lock."""

    connection = engine.connect()
    deadline = time.monotonic() + timeout_seconds
    try:
        while time.monotonic() < deadline:
            acquired = connection.scalar(
                text("SELECT pg_try_advisory_lock(hashtext(:lock_name))"),
                {"lock_name": MIGRATION_LOCK_NAME},
            )
            if acquired:
                print("[lock] Migration lock acquired.")
                return connection
            print("[lock] Another migration job is active; waiting.")
            sleep(interval_seconds)
    except Exception:
        connection.close()
        raise

    connection.close()
    raise DeploymentError(
        f"Migration lock was not acquired within {timeout_seconds} seconds."
    )


def release_migration_lock(connection) -> None:
    try:
        connection.execute(
            text("SELECT pg_advisory_unlock(hashtext(:lock_name))"),
            {"lock_name": MIGRATION_LOCK_NAME},
        )
        print("[lock] Migration lock released.")
    finally:
        connection.close()


def _alembic_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    return config


def prepare_administrator_schema(engine: Engine) -> None:
    """Stop at the auth schema when upgrading a legacy pre-auth database."""

    with engine.connect() as connection:
        schema_name = connection.scalar(text("SELECT current_schema()"))
    if inspect(engine).has_table("users", schema=schema_name):
        print("[migration] Administrator schema is already available.")
        return
    print("[migration] Preparing the administrator schema.")
    command.upgrade(_alembic_config(), "d8f4a2c7e910")
    print("[migration] Administrator schema prepared.")


def run_alembic_upgrade() -> None:
    print("[migration] Applying Alembic migrations.")
    command.upgrade(_alembic_config(), "heads")
    print("[migration] Alembic migrations completed.")


def run_administrator_bootstrap() -> None:
    from app.cli import bootstrap_from_environment

    print("[bootstrap] Verifying the first administrator.")
    result = bootstrap_from_environment()
    if result != 0:
        raise DeploymentError(
            f"Administrator bootstrap failed with exit code {result}."
        )
    print("[bootstrap] Administrator bootstrap completed.")


def migrate_and_bootstrap() -> int:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("[configuration] DATABASE_URL is required.", file=sys.stderr)
        return 2

    try:
        readiness_timeout = _positive_int_environment(
            "CARTAVAULT_DATABASE_READY_TIMEOUT_SECONDS",
            120,
        )
        stable_checks = _positive_int_environment(
            "CARTAVAULT_DATABASE_STABLE_CHECKS",
            3,
        )
        lock_timeout = _positive_int_environment(
            "CARTAVAULT_MIGRATION_LOCK_TIMEOUT_SECONDS",
            300,
        )
        connect_timeout = _positive_int_environment(
            "CARTAVAULT_DATABASE_CONNECT_TIMEOUT_SECONDS",
            5,
        )
    except DeploymentError as error:
        print(f"[configuration] {error}", file=sys.stderr)
        return 2

    print(
        "[configuration] Migration target: "
        f"{_database_target(database_url)}."
    )
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": connect_timeout},
    )

    lock_connection = None
    try:
        wait_for_database(
            engine,
            timeout_seconds=readiness_timeout,
            stable_checks=stable_checks,
        )
        lock_connection = acquire_migration_lock(
            engine,
            timeout_seconds=lock_timeout,
        )
        prepare_administrator_schema(engine)
        run_administrator_bootstrap()
        run_alembic_upgrade()
        run_administrator_bootstrap()
        print("[complete] Database deployment completed successfully.")
        return 0
    except (DeploymentError, SQLAlchemyError) as error:
        print(f"[failure] {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(
            f"[failure] Unexpected {error.__class__.__name__} during deployment.",
            file=sys.stderr,
        )
        return 1
    finally:
        if lock_connection is not None:
            release_migration_lock(lock_connection)
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.deployment")
    parser.add_argument(
        "command",
        choices=("migrate-and-bootstrap",),
    )
    args = parser.parse_args()
    if args.command == "migrate-and-bootstrap":
        return migrate_and_bootstrap()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
