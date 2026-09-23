#!/usr/bin/env python3
"""Test-only recovery-set mutator for the RES-001 integration matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("key")
    args = parser.parse_args()

    manifest_path = args.directory / "s3-objects.jsonl"
    records = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines()]
    retained = [record for record in records if record["key"] != args.key]
    if len(retained) != len(records) - 1:
        raise SystemExit("requested key was not present exactly once")
    manifest_path.write_text(
        "".join(json.dumps(record, ensure_ascii=True, separators=(",", ":"), sort_keys=True) + "\n" for record in retained),
        encoding="utf-8",
        newline="\n",
    )

    archive_path = args.directory / "s3-objects.tar.gz"
    replacement_path = args.directory / "s3-objects.replacement.tar.gz"
    with tarfile.open(archive_path, "r:gz") as source, tarfile.open(replacement_path, "w:gz") as destination:
        for member in source:
            if member.name == args.key:
                continue
            extracted = source.extractfile(member)
            destination.addfile(member, extracted)
    replacement_path.replace(archive_path)

    text_manifest_path = args.directory / "manifest.txt"
    text_lines = text_manifest_path.read_text(encoding="utf-8").splitlines()
    values = {
        "s3_object_count": str(len(retained)),
        "s3_total_bytes": str(sum(int(record["size"]) for record in retained)),
    }
    text_manifest_path.write_text(
        "\n".join(
            f"{key}={values.get(key, value)}" if "=" in line else line
            for line in text_lines
            for key, value in [line.split("=", 1) if "=" in line else (line, "")]
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )

    checksum_path = args.directory / "SHA256SUMS"
    artifact_names = [
        line.split(maxsplit=1)[1].lstrip("*").replace("\\", "/").rsplit("/", 1)[-1]
        for line in checksum_path.read_text(encoding="utf-8").splitlines()
    ]
    with checksum_path.open("w", encoding="utf-8", newline="\n") as destination:
        for name in artifact_names:
            destination.write(f"{sha256(args.directory / name)}  {name}\n")


if __name__ == "__main__":
    main()
