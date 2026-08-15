from __future__ import annotations

import argparse

from check_translations import check as check_translations
from export_openapi import generate as generate_openapi
from generate_cli_reference import generate as generate_cli
from generate_environment_reference import generate as generate_environment
from generate_feature_reference import generate as generate_features
from functional_docs import generate as generate_functional


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate CartaVault technical documentation.")
    parser.add_argument("--check", action="store_true", help="fail when generated files are stale")
    args = parser.parse_args()
    results = [
        generate_functional(check=args.check),
        generate_environment(check=args.check),
        generate_cli(check=args.check),
        generate_features(check=args.check),
        generate_openapi(check=args.check),
    ]
    if args.check:
        results.append(check_translations())
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
