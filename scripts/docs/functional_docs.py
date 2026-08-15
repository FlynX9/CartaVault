from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from common import DOCS_ROOT, GENERATED_NOTICE, ROOT, write_or_check


MANIFEST_PATH = ROOT / "docs" / "functional" / "manifest.json"
SCENARIOS_PATH = ROOT / "demo" / "screenshots.json"
REPORT_JSON = ROOT / "docs" / "generated" / "documentation-coverage.json"
REPORT_MARKDOWN = ROOT / "docs" / "generated" / "documentation-coverage.md"
SIDEBAR_PATH = ROOT / "website" / "src" / "generated" / "functionalSidebar.mjs"
SOURCE_HASHES_PATH = ROOT / "docs" / "generated" / "documentation-source-hashes.json"
FRONTEND_ROOT = ROOT / "frontend" / "src"
SCREENSHOT_ROOTS = (
    ROOT / "website" / "src" / "assets" / "screenshots",
    ROOT / "website" / "public" / "docs" / "screenshots",
    ROOT / "docs" / "screenshots",
)

# Generic dialog primitives and labels left in dead/legacy branches are not
# independently documentable product features. Their concrete callers are
# covered by the functional manifest instead.
IGNORED_DISCOVERED_SURFACES = {
    "dialog:admin-unsaved-title",
    "dialog:confirmation-dialog-title",
    "dialog:empty-state-title",
    "dialog:quota-override-title",
    "dialog:unsaved-changes-title",
}


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def iter_source_files() -> Iterable[Path]:
    yield from FRONTEND_ROOT.rglob("*.tsx")


def discover_surfaces() -> list[dict[str, str]]:
    """Discover durable user-facing surfaces without pretending every component is a feature."""
    found: dict[str, dict[str, str]] = {}
    patterns = (
        ("dialog", re.compile(r'aria-labelledby=(?:\{|)"([a-z][a-z0-9-]+)"')),
        ("route", re.compile(r'\bpath="(/[^"]+)"')),
    )
    for path in iter_source_files():
        if ".test." in path.name:
            continue
        text = path.read_text(encoding="utf-8")
        relative = path.relative_to(ROOT).as_posix()
        for kind, pattern in patterns:
            for match in pattern.finditer(text):
                value = match.group(1)
                if kind == "dialog" and not re.search(rf'id="{re.escape(value)}"', text):
                    continue
                surface_id = f"{kind}:{value}"
                found[surface_id] = {"id": surface_id, "kind": kind, "source": relative}

    app_text = (FRONTEND_ROOT / "components" / "layout" / "MainNavigation.tsx").read_text(encoding="utf-8")
    for panel in sorted(set(re.findall(r"togglePanel\('([a-z-]+)'\)", app_text))):
        found[f"menu:{panel}"] = {"id": f"menu:{panel}", "kind": "menu", "source": "frontend/src/components/layout/MainNavigation.tsx"}

    admin_text = (FRONTEND_ROOT / "pages" / "admin" / "AdminConsole.tsx").read_text(encoding="utf-8")
    for section in re.findall(r"\['([a-z]+)',\s*[A-Z]", admin_text.split("type AdminSectionKey", 1)[0]):
        found[f"admin:{section}"] = {"id": f"admin:{section}", "kind": "admin", "source": "frontend/src/pages/admin/AdminConsole.tsx"}

    account_text = (FRONTEND_ROOT / "components" / "account" / "AccountModal.tsx").read_text(encoding="utf-8")
    for section in re.findall(r"\['([a-z-]+)',\s*[A-Z]", account_text.split("export function AccountModal", 1)[0]):
        found[f"account:{section}"] = {"id": f"account:{section}", "kind": "account", "source": "frontend/src/components/account/AccountModal.tsx"}
    for dialog in re.findall(r"dialog === '([a-z-]+)'", account_text):
        found[f"account-dialog:{dialog}"] = {"id": f"account-dialog:{dialog}", "kind": "dialog", "source": "frontend/src/components/account/AccountModal.tsx"}
    return sorted(
        (item for item in found.values() if item["id"] not in IGNORED_DISCOVERED_SURFACES),
        key=lambda item: item["id"],
    )


def _screenshot_exists(capture_id: str) -> bool:
    candidates = (capture_id, f"app-{capture_id}")
    return any((root / f"{candidate}{suffix}").exists() for root in SCREENSHOT_ROOTS for candidate in candidates for suffix in (".png", ".webp", ".jpg", ".jpeg"))


def _public_screenshot(capture_id: str) -> str | None:
    root = ROOT / "website" / "public" / "docs" / "screenshots"
    for suffix in (".png", ".webp", ".jpg", ".jpeg"):
        if (root / f"{capture_id}{suffix}").is_file():
            return f"/docs/screenshots/{capture_id}{suffix}"
    return None


def _content_hash(paths: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for value in sorted(set(paths)):
        path = ROOT / value
        digest.update(value.encode())
        if path.is_file():
            digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    ids: set[str] = set()
    docs: set[tuple[str, str]] = set()
    for feature in manifest["features"]:
        feature_id = feature.get("id", "")
        if feature_id in ids:
            errors.append(f"duplicate feature id: {feature_id}")
        ids.add(feature_id)
        for field in ("section", "documentation", "roles", "entryPoint", "codeRefs", "related", "locales"):
            if not feature.get(field):
                errors.append(f"{feature_id}: missing {field}")
        if "surfaces" not in feature:
            errors.append(f"{feature_id}: missing surfaces")
        for language in ("fr", "en"):
            localized = feature.get("locales", {}).get(language, {})
            for field in ("title", "description", "why", "where", "steps", "behavior"):
                if not localized.get(field):
                    errors.append(f"{feature_id}: missing {language}.{field}")
            key = (language, feature.get("documentation", ""))
            if key in docs:
                errors.append(f"duplicate documentation path: {key[1]} ({language})")
            docs.add(key)
    return errors


def build_coverage(manifest: dict[str, Any], expected_hashes: dict[str, str] | None = None) -> dict[str, Any]:
    discovered = discover_surfaces()
    covered_surfaces = {surface for feature in manifest["features"] for surface in feature["surfaces"]}
    discovered_ids = {surface["id"] for surface in discovered}
    scenarios = {item["id"] for item in json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))}
    features = []
    for feature in manifest["features"]:
        capture_ids = feature.get("captures", [])
        missing_scenarios = [item for item in capture_ids if item not in scenarios]
        missing_captures = [item for item in capture_ids if not _screenshot_exists(item)]
        missing_code = [item for item in feature["codeRefs"] if not (ROOT / item).exists()]
        source_hash = _content_hash(feature["codeRefs"])
        expected_hash = (expected_hashes or {}).get(feature["id"])
        stale = expected_hash is not None and expected_hash != source_hash
        features.append({
            "id": feature["id"], "section": feature["section"], "documentation": feature["documentation"],
            "documented": all(feature["locales"].get(language) for language in ("fr", "en")),
            "scenario": feature.get("scenario") in scenarios if feature.get("scenario") else False,
            "captures": capture_ids, "missing_scenarios": missing_scenarios, "missing_captures": missing_captures,
            "missing_code_refs": missing_code, "potentially_stale": stale, "source_hash": source_hash,
        })
    documented = sum(item["documented"] for item in features)
    scenario_count = sum(item["scenario"] for item in features)
    capture_ready = sum(not item["missing_captures"] and bool(item["captures"]) for item in features)
    unmanifested = [surface for surface in discovered if surface["id"] not in covered_surfaces]
    detected_features = len(features) + len(unmanifested)
    return {
        "summary": {
            "detected": detected_features, "detected_surfaces": len(discovered), "manifested": len(features), "documented": documented,
            "scenarios": scenario_count, "captures_ready": capture_ready,
            "coverage_percent": round(documented / detected_features * 100, 1) if detected_features else 0,
        },
        "sections": [
            {
                "id": section,
                "features": len(items),
                "documented": sum(item["documented"] for item in items),
                "scenarios": sum(item["scenario"] for item in items),
                "captures_ready": sum(not item["missing_captures"] and bool(item["captures"]) for item in items),
            }
            for section, items in sorted(_group(features, "section").items())
        ],
        "unmanifested_surfaces": unmanifested,
        "unknown_manifest_surfaces": sorted(covered_surfaces - discovered_ids),
        "features": features,
    }


def _group(items: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        result[item[key]].append(item)
    return result


def render_page(feature: dict[str, Any], language: str, version: str) -> str:
    text = feature["locales"][language]
    labels = {
        "fr": ("À quoi sert cette fonction ?", "Où la trouver ?", "Comment l’utiliser ?", "Comment ça fonctionne ?", "À savoir", "Voir aussi", "Accès", "Version", "Avant de commencer", "Résultat attendu"),
        "en": ("What is this feature for?", "Where can I find it?", "How do I use it?", "How does it work?", "Good to know", "See also", "Access", "Version", "Before you start", "Expected result"),
    }[language]
    related = {item["id"]: item for item in load_manifest()["features"]}
    related_lines = []
    for related_id in feature["related"]:
        item = related.get(related_id)
        if item:
            related_lines.append(f"- [{item['locales'][language]['title']}](/docs/{language}/{item['documentation']}/)")
    steps = "\n".join(f"{index}. {step}" for index, step in enumerate(text["steps"], 1))
    behavior = "\n".join(f"- {item}" for item in text["behavior"])
    notes = "\n".join(f"- {item}" for item in text.get("notes", [])) or ("- Aucun point particulier." if language == "fr" else "- No special restriction.")
    role_labels = {
        "fr": {"public": "Public", "user": "Utilisateur", "viewer": "Lecteur", "editor": "Éditeur", "map-owner": "Propriétaire de carte", "admin": "Administrateur"},
        "en": {"public": "Public", "user": "User", "viewer": "Viewer", "editor": "Editor", "map-owner": "Map owner", "admin": "Administrator"},
    }[language]
    roles = ", ".join(role_labels.get(role, role) for role in feature["roles"])
    admin_only = feature["roles"] == ["admin"]
    access_note = (
        ":::caution\nCette page concerne l’administration de l’instance. Elle n’est accessible qu’aux administrateurs.\n:::\n\n"
        if language == "fr" and admin_only else
        ":::caution\nThis page covers instance administration and is only available to administrators.\n:::\n\n"
        if language == "en" and admin_only else ""
    )
    expected = text.get("expected") or text["behavior"][0]
    route_sentence = "Suivez ce chemin dans l’interface" if language == "fr" else "Follow this path in the interface"
    is_concept = feature["section"] == "concepts"
    screenshots = []
    for capture_id in feature.get("captures", []):
        screenshot = _public_screenshot(capture_id)
        if screenshot:
            caption = text.get("captureCaptions", {}).get(capture_id, text["title"])
            screenshots.append(f"![{caption}]({screenshot})\n\n*{caption}*")
    screenshot_block = "\n\n".join(screenshots)
    if screenshot_block:
        screenshot_block = f"\n\n{screenshot_block}"
    preconditions_rows = f"| **{labels[6]}** | {roles} |" if is_concept else f"| **{labels[1]}** | {text['where']} |\n| **{labels[6]}** | {roles} |"
    location_block = (
        f"## {'Illustration' if language == 'fr' else 'Illustration'}\n{screenshot_block}"
        if is_concept else
        f"## {labels[1]}\n\n{route_sentence} : **{text['where']}**.\n{screenshot_block}"
    )
    return f'''---
title: {text["title"]}
description: {text["description"]}
sidebar:
  order: {feature.get("order", 50)}
---

{GENERATED_NOTICE}
## {labels[0]}

{text["why"]}

{access_note}## {labels[8]}

| | |
| --- | --- |
{preconditions_rows}

{location_block}

## {labels[2]}

{steps}

### {labels[9]}

{expected}

## {labels[3]}

{behavior}

## {labels[4]}

:::note
{notes}
:::

## {labels[5]}

{chr(10).join(related_lines)}

<small>{labels[7]} CartaVault : **{version}** · ID : `{feature["id"]}`</small>
'''


def render_sidebar(manifest: dict[str, Any]) -> str:
    section_titles_en = {
        "getting-started": "Getting started", "concepts": "Understand CartaVault", "maps": "Maps",
        "places": "Places", "organization": "Organization", "trips": "Trips",
        "media": "Media, import and export", "offline": "Offline", "account": "Account",
        "administration": "Administration", "deployment": "Self-hosting",
    }
    sidebars: dict[str, list[dict[str, Any]]] = {"fr": [], "en": []}
    grouped = _group(manifest["features"], "section")
    for language in ("fr", "en"):
        for section in sorted(manifest["sections"], key=lambda item: item["order"]):
            items = sorted(grouped.get(section["id"], []), key=lambda item: (item.get("order", 50), item["documentation"]))
            label = section["title"] if language == "fr" else section_titles_en[section["id"]]
            sidebars[language].append({
                "label": label,
                "collapsed": section.get("collapsed", False),
                "items": [{"label": item["locales"][language]["title"], "link": f"/docs/{language}/{item['documentation']}/"} for item in items],
            })
    payload = json.dumps(sidebars, ensure_ascii=False, indent=2)
    return f"// Generated from docs/functional/manifest.json.\nexport const functionalSidebar = {payload};\n"


def render_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    rows = "\n".join(
        f"| {item['id']} | {item['features']} | {item['documented']} | {item['scenarios']} | {item['captures_ready']} |"
        for item in report["sections"]
    )
    gaps = []
    for surface in report["unmanifested_surfaces"]:
        gaps.append(f"- ⚠ `{surface['id']}` — surface détectée mais non référencée ({surface['source']})")
    for feature in report["features"]:
        if feature["missing_scenarios"]:
            gaps.append(f"- ⚠ `{feature['id']}` — scénarios absents : {', '.join(feature['missing_scenarios'])}")
        if feature["missing_captures"]:
            gaps.append(f"- ⚠ `{feature['id']}` — captures absentes : {', '.join(feature['missing_captures'])}")
        if feature["potentially_stale"]:
            gaps.append(f"- ⚠ `{feature['id']}` — documentation potentiellement obsolète")
    return f"""# Couverture documentaire CartaVault

| Indicateur | Valeur |
| --- | ---: |
| Fonctions détectées | {summary['detected']} |
| Surfaces UI détectées | {summary['detected_surfaces']} |
| Fonctions manifestées | {summary['manifested']} |
| Fonctions documentées | {summary['documented']} |
| Scénarios UI | {summary['scenarios']} |
| Captures disponibles | {summary['captures_ready']} |
| Couverture documentaire | {summary['coverage_percent']} % |

| Section | Fonctions | Documentées | Scénarios | Captures |
| --- | ---: | ---: | ---: | ---: |
{rows}

## Trous et vérifications

{chr(10).join(gaps) if gaps else '- Aucun trou détecté.'}
"""


def generate(*, check: bool, version: str = "master") -> bool:
    manifest = load_manifest()
    errors = validate_manifest(manifest)
    if errors:
        for error in errors:
            print(f"Functional manifest error: {error}")
        return False
    results = []
    for feature in manifest["features"]:
        for language in ("fr", "en"):
            results.append(write_or_check(DOCS_ROOT / language / feature["documentation"] / "index.md", render_page(feature, language, version), check=check))
    current_hashes = {feature["id"]: _content_hash(feature["codeRefs"]) for feature in manifest["features"]}
    expected_hashes = current_hashes
    if check and SOURCE_HASHES_PATH.is_file():
        expected_hashes = json.loads(SOURCE_HASHES_PATH.read_text(encoding="utf-8"))
    report = build_coverage(manifest, expected_hashes)
    results.append(write_or_check(SOURCE_HASHES_PATH, json.dumps(current_hashes, ensure_ascii=False, indent=2), check=check))
    results.append(write_or_check(REPORT_JSON, json.dumps(report, ensure_ascii=False, indent=2), check=check))
    results.append(write_or_check(REPORT_MARKDOWN, render_report(report), check=check))
    results.append(write_or_check(SIDEBAR_PATH, render_sidebar(manifest), check=check))
    return all(results)
