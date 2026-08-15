from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from common import ROOT


SOURCE = ROOT / "demo" / "output"
TARGET = ROOT / "website" / "public" / "docs" / "screenshots"


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize deterministic demo captures with the documentation build.")
    parser.add_argument("--check", action="store_true", help="fail when a demo capture is not synchronized")
    args = parser.parse_args()
    sources = sorted(SOURCE.glob("*.png"))
    if not sources:
        print(f"No screenshots found in {SOURCE}")
        return 1
    TARGET.mkdir(parents=True, exist_ok=True)
    stale = []
    for source in sources:
        target = TARGET / source.name
        if not target.exists() or source.read_bytes() != target.read_bytes():
            stale.append(source.name)
            if not args.check:
                shutil.copyfile(source, target)
    if stale:
        action = "Out-of-date" if args.check else "Synchronized"
        print(f"{action} documentation screenshots: {', '.join(stale)}")
    return 1 if args.check and stale else 0


if __name__ == "__main__":
    raise SystemExit(main())
