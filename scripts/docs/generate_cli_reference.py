from __future__ import annotations

import ast

from common import DOCS_ROOT, GENERATED_NOTICE, ROOT, write_or_check


MODULES = ("app.cli", "app.setup_cli", "app.deployment")


def collect(module: str) -> tuple[str, list[str], list[str]]:
    path = ROOT / "backend" / (module.replace(".", "/") + ".py")
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    prog = f"python -m {module}"
    commands: set[str] = set()
    options: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Attribute) and node.func.attr == "ArgumentParser":
            for keyword in node.keywords:
                if keyword.arg == "prog" and isinstance(keyword.value, ast.Constant):
                    prog = str(keyword.value.value)
        if isinstance(node.func, ast.Attribute) and node.func.attr == "add_parser" and node.args and isinstance(node.args[0], ast.Constant):
            commands.add(str(node.args[0].value))
        if isinstance(node.func, ast.Attribute) and node.func.attr == "add_argument":
            for arg in node.args:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and arg.value.startswith("-"):
                    options.add(arg.value)
            if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == "command":
                for keyword in node.keywords:
                    if keyword.arg == "choices" and isinstance(keyword.value, (ast.Tuple, ast.List)):
                        commands.update(
                            str(item.value)
                            for item in keyword.value.elts
                            if isinstance(item, ast.Constant)
                        )
    return prog, sorted(commands), sorted(options)


def render(language: str) -> str:
    title = "Commandes d'administration" if language == "fr" else "Administration commands"
    description = "Référence générée depuis les analyseurs `argparse`." if language == "fr" else "Reference generated from the `argparse` parsers."
    sections = []
    for module in MODULES:
        prog, commands, options = collect(module)
        command_lines = "\n".join(f"- `{prog} {command}`" for command in commands) or "- —"
        option_text = ", ".join(f"`{option}`" for option in options) or "—"
        sections.append(f"## `{module}`\n\n{command_lines}\n\n**Options:** {option_text}")
    rendered_sections = "\n\n".join(sections)
    return f"""---
title: {title}
description: {description}
sidebar:
  order: 21
---

{GENERATED_NOTICE}
{description}

{rendered_sections}
"""


def generate(*, check: bool) -> bool:
    return all(write_or_check(DOCS_ROOT / language / "reference" / "cli.md", render(language), check=check) for language in ("fr", "en"))
