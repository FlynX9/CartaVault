from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from common import ROOT


SOURCE = ROOT / "demo" / "screenshots.base.json"
TARGET = ROOT / "demo" / "screenshots.json"
VARIANT_RE = re.compile(r"-(fr|en)-(light|mobile)$")
SINGLE_VARIANT_PREFIXES = ("places-italy-", "viewer-readonly-")


def family_id(identifier: str) -> str:
    return VARIANT_RE.sub("", identifier)


def build_matrix() -> list[dict[str, object]]:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    families: dict[str, dict[str, object]] = {}
    supplemental: list[dict[str, object]] = []

    for scenario in source:
        identifier = str(scenario["id"])
        if identifier.endswith("-dark") or identifier.startswith(SINGLE_VARIANT_PREFIXES):
            supplemental.append(scenario)
            continue
        family = family_id(identifier)
        current = families.get(family)
        if current is None or identifier.endswith("-fr-light"):
            families[family] = scenario

    generated: list[dict[str, object]] = []
    for family, template in families.items():
        for language in ("fr", "en"):
            for mobile in (False, True):
                scenario = dict(template)
                scenario["id"] = f"{family}-{language}-{'mobile' if mobile else 'light'}"
                scenario["language"] = language
                scenario["theme"] = "light"
                if mobile:
                    scenario["mobile"] = True
                else:
                    scenario.pop("mobile", None)
                generated.append(scenario)

    return generated + supplemental


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the localized desktop/mobile documentation screenshot matrix.")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = json.dumps(build_matrix(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != content:
            print("demo/screenshots.json is stale; regenerate the screenshot matrix.")
            return 1
        return 0
    TARGET.write_text(content, encoding="utf-8")
    print(f"Generated {len(json.loads(content))} documentation screenshot scenarios.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
