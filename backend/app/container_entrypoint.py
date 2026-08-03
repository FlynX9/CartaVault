"""Single-process container startup: migrate first, then replace with Uvicorn."""

from __future__ import annotations

import os
import sys
from collections.abc import Callable, Sequence

from app.deployment import migrate_and_bootstrap


DEFAULT_COMMAND = (
    "python",
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    "8000",
    "--proxy-headers",
    "--forwarded-allow-ips",
    "*",
)


def run(
    command: Sequence[str],
    *,
    migrate: Callable[[], int] = migrate_and_bootstrap,
    exec_process: Callable[[str, Sequence[str]], object] = os.execvp,
) -> int:
    print("[startup] Waiting for the database and applying migrations.", flush=True)
    migration_result = migrate()
    if migration_result != 0:
        print("[startup] Migration failed; Uvicorn will not start.", file=sys.stderr)
        return migration_result
    if not command:
        print("[startup] No application command was provided.", file=sys.stderr)
        return 2
    print("[startup] Migrations completed; starting CartaVault.", flush=True)
    exec_process(command[0], command)
    return 0


def main() -> int:
    return run(tuple(sys.argv[1:]) or DEFAULT_COMMAND)


if __name__ == "__main__":
    raise SystemExit(main())
