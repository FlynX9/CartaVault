from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any


def _dependencies(report: Any) -> list[dict[str, Any]]:
    if isinstance(report, list):
        return [item for item in report if isinstance(item, dict)]
    if isinstance(report, dict) and isinstance(report.get("dependencies"), list):
        return [
            item
            for item in report["dependencies"]
            if isinstance(item, dict)
        ]
    return []


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "Usage: classify_pip_audit.py <report.json> <audit-exit-code> "
            "<exceptions.json>",
            file=sys.stderr,
        )
        return 2

    report_path = Path(sys.argv[1])
    exceptions_path = Path(sys.argv[3])

    try:
        audit_exit_code = int(sys.argv[2])
        report = json.loads(report_path.read_text(encoding="utf-8"))
        exception_records = json.loads(
            exceptions_path.read_text(encoding="utf-8")
        )
    except (OSError, ValueError, json.JSONDecodeError):
        print(
            "::error title=pip-audit unavailable::The pip-audit report was "
            "missing or invalid. Treat this as a registry or audit-tool "
            "failure, not as a confirmed vulnerability.",
            file=sys.stderr,
        )
        return 2

    if not isinstance(exception_records, list):
        print(
            "::error title=Invalid audit exceptions::The dependency exception "
            "registry must be a JSON array.",
            file=sys.stderr,
        )
        return 2

    today = date.today().isoformat()
    python_exceptions: set[str] = set()
    required_fields = {
        "id",
        "owner",
        "rationale",
        "mitigation",
        "expires",
    }

    for exception in exception_records:
        if (
            not isinstance(exception, dict)
            or exception.get("ecosystem") != "pypi"
        ):
            continue
        if any(not exception.get(field) for field in required_fields):
            print(
                "::error title=Invalid audit exception::A Python dependency "
                "exception is incomplete.",
                file=sys.stderr,
            )
            return 2
        if str(exception["expires"]) < today:
            print(
                "::error title=Expired audit exception::The Python exception "
                f"{exception['id']} expired on {exception['expires']}.",
                file=sys.stderr,
            )
            return 2
        python_exceptions.add(str(exception["id"]))

    dependencies = _dependencies(report)
    vulnerabilities = [
        vulnerability
        for dependency in dependencies
        if isinstance(dependency.get("vulns"), list)
        for vulnerability in dependency["vulns"]
        if isinstance(vulnerability, dict)
    ]
    active_vulnerabilities = [
        vulnerability
        for vulnerability in vulnerabilities
        if str(vulnerability.get("id", "")) not in python_exceptions
    ]
    ignored_vulnerabilities = [
        vulnerability
        for vulnerability in vulnerabilities
        if str(vulnerability.get("id", "")) in python_exceptions
    ]

    print(
        f"pip-audit summary: {len(dependencies)} dependencies, "
        f"{len(vulnerabilities)} known vulnerabilities."
    )

    for vulnerability in ignored_vulnerabilities:
        print(
            "Temporarily excepted Python advisory "
            f"{vulnerability.get('id')}; see {exceptions_path}."
        )

    if active_vulnerabilities:
        print(
            "::error title=Backend vulnerabilities detected::pip-audit "
            f"confirmed {len(active_vulnerabilities)} known vulnerabilities.",
            file=sys.stderr,
        )
        return 1

    if audit_exit_code != 0 and not ignored_vulnerabilities:
        print(
            "::error title=pip-audit unavailable::The audit command failed "
            "without a valid vulnerability finding. Check registry and OSV "
            "availability.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
