from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from common import ROOT


SOURCE = ROOT / "demo" / "output"
TARGET = ROOT / "website" / "public" / "docs" / "screenshots"
MARKETING_TARGET = ROOT / "website" / "src" / "assets" / "screenshots"
MARKETING_SCREENSHOTS = {
    "app-places-fr.png": "places-france-fr-light.png",
    "app-places-en.png": "places-france-en-light.png",
    "app-places-mobile-fr.png": "places-france-fr-mobile.png",
    "app-places-mobile-en.png": "places-france-en-mobile.png",
    "app-place-popup-fr.png": "place-popup-france-fr-light.png",
    "app-place-popup-en.png": "place-popup-france-en-light.png",
    "app-place-popup-mobile-fr.png": "place-popup-france-fr-mobile.png",
    "app-place-popup-mobile-en.png": "place-popup-france-en-mobile.png",
    "app-trip-fr.png": "trip-france-fr-light.png",
    "app-trip-en.png": "trip-france-en-light.png",
    "app-trip-mobile-fr.png": "trip-france-fr-mobile.png",
    "app-trip-mobile-en.png": "trip-france-en-mobile.png",
    "app-timeline-fr.png": "timeline-france-fr-light.png",
    "app-timeline-en.png": "timeline-france-en-light.png",
    "app-media-fr.png": "media-fr-light.png",
    "app-media-en.png": "media-en-light.png",
    "app-account-fr.png": "account-profile-fr-light.png",
    "app-account-en.png": "account-profile-en-light.png",
    "app-account-mobile-fr.png": "account-profile-fr-mobile.png",
    "app-account-mobile-en.png": "account-profile-en-mobile.png",
    "app-admin-fr.png": "admin-users-fr-light.png",
    "app-admin-en.png": "admin-users-en-light.png",
    "app-admin-mobile-fr.png": "admin-users-fr-mobile.png",
    "app-admin-mobile-en.png": "admin-users-en-mobile.png",
}


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
    MARKETING_TARGET.mkdir(parents=True, exist_ok=True)
    for target_name, source_name in MARKETING_SCREENSHOTS.items():
        source = SOURCE / source_name
        target = MARKETING_TARGET / target_name
        if not source.is_file():
            stale.append(source_name)
            continue
        if not target.exists() or source.read_bytes() != target.read_bytes():
            stale.append(target_name)
            if not args.check:
                shutil.copyfile(source, target)
    if stale:
        action = "Out-of-date" if args.check else "Synchronized"
        print(f"{action} documentation screenshots: {', '.join(stale)}")
    return 1 if args.check and stale else 0


if __name__ == "__main__":
    raise SystemExit(main())
