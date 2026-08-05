from __future__ import annotations

import json

from common import DOCS_ROOT, GENERATED_NOTICE, ROOT, write_or_check


def render(language: str) -> str:
    payload = json.loads((ROOT / "docs" / "features.json").read_text(encoding="utf-8"))
    title = "Catalogue des fonctionnalités" if language == "fr" else "Feature catalog"
    description = "Vue structurée des capacités prises en charge." if language == "fr" else "Structured overview of supported capabilities."
    rows = "\n".join(f"| `{feature['id']}` | {feature[language]['name']} | {feature[language]['summary']} |" for feature in payload["features"])
    return f"""---
title: {title}
description: {description}
sidebar:
  order: 22
---

{GENERATED_NOTICE}
| ID | {"Fonction" if language == "fr" else "Feature"} | {"Portée" if language == "fr" else "Scope"} |
| --- | --- | --- |
{rows}
"""


def generate(*, check: bool) -> bool:
    return all(write_or_check(DOCS_ROOT / language / "reference" / "features.md", render(language), check=check) for language in ("fr", "en"))
