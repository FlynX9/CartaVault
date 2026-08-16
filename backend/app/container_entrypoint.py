"""Single-process container startup: migrate first, then replace with Uvicorn."""

from __future__ import annotations

import os
import sys
from collections.abc import Callable, Sequence

from app.deployment import migrate_and_bootstrap


def _worker_count() -> int:
    raw_value = os.getenv("CARTAVAULT_UVICORN_WORKERS", "1")
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError("CARTAVAULT_UVICORN_WORKERS must be an integer") from error
    if value < 1 or value > 16:
        raise RuntimeError("CARTAVAULT_UVICORN_WORKERS must be between 1 and 16")
    return value


def build_default_command() -> tuple[str, ...]:
    """Build a Uvicorn command that never trusts arbitrary proxy headers."""

    command = [
        "python", "-m", "uvicorn", "app.main:app",
        "--host", "0.0.0.0", "--port", "8000",
        "--workers", str(_worker_count()),
    ]
    trusted_proxies = os.getenv("CARTAVAULT_FORWARDED_ALLOW_IPS", "").strip()
    if trusted_proxies == "*":
        raise RuntimeError(
            "CARTAVAULT_FORWARDED_ALLOW_IPS must contain explicit proxy IPs "
            "or CIDR ranges; wildcard trust is forbidden"
        )
    if trusted_proxies:
        command.extend(("--proxy-headers", "--forwarded-allow-ips", trusted_proxies))
    else:
        command.append("--no-proxy-headers")
    return tuple(command)


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
    return run(tuple(sys.argv[1:]) or build_default_command())


if __name__ == "__main__":
    raise SystemExit(main())
