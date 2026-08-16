"""Copy an existing local photo tree to configured private S3 storage."""

from __future__ import annotations

import argparse
import mimetypes
import os
from pathlib import Path

from app.photos.object_storage import S3ObjectStorage
from app.photos.storage import BACKEND_ROOT


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Upload files; without this flag only report them")
    arguments = parser.parse_args()
    if os.getenv("MEDIA_STORAGE", "").strip().lower() != "s3":
        parser.error("set MEDIA_STORAGE=s3 and the S3_* variables before running")
    root = Path(os.getenv("PHOTO_STORAGE_PATH", "storage/photos"))
    if not root.is_absolute():
        root = (BACKEND_ROOT / root).resolve()
    if not root.is_dir():
        parser.error(f"local photo directory does not exist: {root}")
    backend = S3ObjectStorage()
    files = [path for path in root.rglob("*") if path.is_file() and ".partial" not in path.name]
    total_bytes = sum(path.stat().st_size for path in files)
    print(f"Found {len(files)} files ({total_bytes} bytes) below {root}")
    if not arguments.apply:
        print("Dry run only. Re-run with --apply to copy; local files are never deleted.")
        return 0
    for index, path in enumerate(files, start=1):
        key = path.relative_to(root).as_posix()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        backend.put(key, path, content_type=content_type)
        print(f"[{index}/{len(files)}] {key}")
    print("Upload complete. Verify reads through CartaVault before changing or removing local storage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
