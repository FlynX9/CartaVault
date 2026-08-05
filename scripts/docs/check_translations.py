from __future__ import annotations

import re
from pathlib import Path

from common import DOCS_ROOT


def relative_pages(language: str) -> set[Path]:
    root = DOCS_ROOT / language
    return {path.relative_to(root) for path in root.rglob("*") if path.suffix in {".md", ".mdx"}}


def check() -> bool:
    fr = relative_pages("fr")
    en = relative_pages("en")
    ok = True
    for label, pages in (("missing in English", fr - en), ("missing in French", en - fr)):
        for page in sorted(pages):
            print(f"Translation parity error ({label}): {page.as_posix()}")
            ok = False
    for language in ("fr", "en"):
        for relative in sorted(relative_pages(language)):
            path = DOCS_ROOT / language / relative
            text = path.read_text(encoding="utf-8")
            if not text.startswith("---\n"):
                print(f"Missing frontmatter: {path}")
                ok = False
            if not re.search(r"^description:\s*\S", text, re.MULTILINE):
                print(f"Missing description: {path}")
                ok = False
            for match in re.finditer(r"<ProductScreenshot\b[^>]*>", text, re.DOTALL):
                if not re.search(r"\balt=", match.group(0)):
                    print(f"Missing screenshot alt text: {path}")
                    ok = False
    return ok


if __name__ == "__main__":
    raise SystemExit(0 if check() else 1)
