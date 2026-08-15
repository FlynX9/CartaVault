from __future__ import annotations

import difflib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCS_ROOT = ROOT / "website" / "src" / "content" / "docs" / "docs"
GENERATED_NOTICE = "<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->\n"


def write_or_check(path: Path, content: str, *, check: bool) -> bool:
    normalized = content.rstrip() + "\n"
    if check:
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current == normalized:
            return True
        print(f"Generated documentation is stale: {path.relative_to(ROOT)}")
        diff = "".join(difflib.unified_diff(current.splitlines(True), normalized.splitlines(True), fromfile="current", tofile="generated"))[:4000]
        encoding = sys.stdout.encoding or "utf-8"
        print(diff.encode(encoding, errors="backslashreplace").decode(encoding))
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(normalized, encoding="utf-8")
    return True
