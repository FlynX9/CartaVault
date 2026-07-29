from __future__ import annotations

import argparse
import os
import re
import secrets
import sys
from pathlib import Path
from urllib.parse import quote

from cryptography.fernet import Fernet


PLACEHOLDER_PREFIXES = ("", "replace-", "change-", "generate-")


def _read_values(path: Path) -> tuple[list[str], dict[str, str]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    values: dict[str, str] = {}
    for line in lines:
        match = re.match(r"^([A-Z][A-Z0-9_]*)=(.*)$", line)
        if match:
            values[match.group(1)] = match.group(2)
    return lines, values


def _needs_generation(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return any(normalized.startswith(prefix) for prefix in PLACEHOLDER_PREFIXES if prefix) or not normalized


def _replace_values(lines: list[str], updates: dict[str, str]) -> str:
    remaining = dict(updates)
    output: list[str] = []
    for line in lines:
        match = re.match(r"^([A-Z][A-Z0-9_]*)=", line)
        if match and match.group(1) in remaining:
            key = match.group(1)
            output.append(f"{key}={remaining.pop(key)}")
        else:
            output.append(line)
    if remaining:
        output.append("")
        output.extend(f"{key}={value}" for key, value in remaining.items())
    return "\n".join(output).rstrip() + "\n"


def generate_secrets(path: Path, *, rotate_setup_token: bool = False) -> int:
    if not path.is_file():
        print(f"Configuration file not found: {path}", file=sys.stderr)
        return 2
    lines, values = _read_values(path)
    updates: dict[str, str] = {}

    if _needs_generation(values.get("POSTGRES_PASSWORD")):
        updates["POSTGRES_PASSWORD"] = secrets.token_urlsafe(36)
    postgres_password = updates.get("POSTGRES_PASSWORD", values.get("POSTGRES_PASSWORD", ""))
    database_url = values.get("DATABASE_URL")
    if _needs_generation(database_url) or "replace-" in (database_url or ""):
        database = values.get("POSTGRES_DB", "cartavault")
        user = values.get("POSTGRES_USER", "cartavault")
        updates["DATABASE_URL"] = (
            f"postgresql+psycopg://{quote(user, safe='')}:{quote(postgres_password, safe='')}"
            f"@postgres:5432/{quote(database, safe='')}"
        )
    if _needs_generation(values.get("CARTAVAULT_SESSION_SECRET")):
        updates["CARTAVAULT_SESSION_SECRET"] = secrets.token_urlsafe(48)
    if _needs_generation(values.get("CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY")):
        updates["CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY"] = Fernet.generate_key().decode("ascii")

    token_was_generated = rotate_setup_token or _needs_generation(values.get("CARTAVAULT_SETUP_TOKEN"))
    if token_was_generated:
        updates["CARTAVAULT_SETUP_TOKEN"] = secrets.token_urlsafe(48)

    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(_replace_values(lines, updates), encoding="utf-8")
    os.replace(temporary, path)
    try:
        path.chmod(0o600)
    except OSError:
        pass

    print(f"Persistent secrets are configured in {path}.")
    print("Back up this file outside the container.")
    print("Losing CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY makes stored credentials unrecoverable.")
    if token_was_generated:
        print(f"Initial setup token (shown once): {updates['CARTAVAULT_SETUP_TOKEN']}")
    else:
        print("Initial setup token already exists and was not displayed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.setup_cli")
    subcommands = parser.add_subparsers(dest="command", required=True)
    generate = subcommands.add_parser("generate-secrets")
    generate.add_argument("--env-file", default=os.getenv("CARTAVAULT_ENV_FILE", "/config/.env"))
    generate.add_argument("--rotate-setup-token", action="store_true")
    arguments = parser.parse_args()
    if arguments.command == "generate-secrets":
        return generate_secrets(
            Path(arguments.env_file),
            rotate_setup_token=arguments.rotate_setup_token,
        )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
