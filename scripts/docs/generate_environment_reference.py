from __future__ import annotations

import ast
from pathlib import Path

from common import DOCS_ROOT, GENERATED_NOTICE, ROOT, write_or_check


def _literal(node: ast.AST | None, name: str) -> str:
    if any(token in name for token in ("PASSWORD", "SECRET", "TOKEN", "KEY")):
        return "sensitive value"
    if node is None:
        return "—"
    try:
        value = ast.literal_eval(node)
    except (ValueError, TypeError):
        return "dynamic"
    if value in (None, ""):
        return "required / empty"
    text = str(value).replace("|", "\\|").replace("\n", " ")
    if any(token in text.lower() for token in ("password", "secret", "token")):
        return "sensitive value"
    return f"`{text}`"


def collect() -> list[tuple[str, str, str]]:
    found: dict[str, tuple[str, str]] = {}
    for path in sorted((ROOT / "backend" / "app").rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            func = node.func
            if not (isinstance(func, ast.Attribute) and func.attr == "getenv"):
                continue
            if not isinstance(node.args[0], ast.Constant) or not isinstance(node.args[0].value, str):
                continue
            name = node.args[0].value
            default = node.args[1] if len(node.args) > 1 else None
            found.setdefault(name, (_literal(default, name), path.relative_to(ROOT).as_posix()))
    return [(name, *found[name]) for name in sorted(found)]


def render(language: str) -> str:
    title = "Variables d'environnement" if language == "fr" else "Environment variables"
    description = "Référence générée depuis les appels `os.getenv` du backend." if language == "fr" else "Reference generated from backend `os.getenv` calls."
    intro = "Les valeurs sensibles ne sont jamais reproduites. Une valeur `dynamic` est calculée dans le code." if language == "fr" else "Sensitive values are never reproduced. A `dynamic` value is computed in code."
    rows = "\n".join(f"| `{name}` | {default} | `{source}` |" for name, default, source in collect())
    return f"""---
title: {title}
description: {description}
sidebar:
  order: 20
---

{GENERATED_NOTICE}
{intro}

| Variable | Default | Source |
| --- | --- | --- |
{rows}
"""


def generate(*, check: bool) -> bool:
    return all(write_or_check(DOCS_ROOT / language / "reference" / "environment.md", render(language), check=check) for language in ("fr", "en"))
