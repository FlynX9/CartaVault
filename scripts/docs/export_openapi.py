from __future__ import annotations

import json
import os
import sys

from common import DOCS_ROOT, GENERATED_NOTICE, ROOT, write_or_check


def load_schema() -> dict[str, object]:
    os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
    os.environ.setdefault("CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY", "")
    os.environ.setdefault("CARTAVAULT_SESSION_SECRET", "documentation-build-only")
    os.environ.setdefault("PYTEST_CURRENT_TEST", "documentation-build")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import app

    return app.openapi()


def page(language: str, schema: dict[str, object]) -> str:
    paths = schema.get("paths", {})
    operation_count = sum(len([method for method in value if method.lower() in {"get", "post", "put", "patch", "delete"}]) for value in paths.values())
    title = "API HTTP" if language == "fr" else "HTTP API"
    description = "Vue générée du contrat OpenAPI CartaVault." if language == "fr" else "Generated overview of CartaVault's OpenAPI contract."
    details = (
        f"Le schéma contient **{len(paths)} chemins** et **{operation_count} opérations**. Sur une instance en cours d'exécution, utilisez `/api/docs` pour l'interface interactive et `/api/openapi.json` pour le document JSON."
        if language == "fr"
        else f"The schema contains **{len(paths)} paths** and **{operation_count} operations**. On a running instance, use `/api/docs` for the interactive UI and `/api/openapi.json` for the JSON document."
    )
    artifact = (
        "Le document versionné est disponible dans [`/docs/openapi.json`](/docs/openapi.json)."
        if language == "fr"
        else "The versioned document is available at [`/docs/openapi.json`](/docs/openapi.json)."
    )
    return f"""---
title: {title}
description: {description}
sidebar:
  order: 23
---

{GENERATED_NOTICE}
{details}

{artifact}
"""


def generate(*, check: bool) -> bool:
    schema = load_schema()
    schema_text = json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    results = [write_or_check(ROOT / "website" / "public" / "docs" / "openapi.json", schema_text, check=check)]
    results.extend(write_or_check(DOCS_ROOT / language / "reference" / "api.md", page(language, schema), check=check) for language in ("fr", "en"))
    return all(results)
