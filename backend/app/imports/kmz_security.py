"""Validation helpers for untrusted KMZ archives."""

from __future__ import annotations

import os
import stat
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath


class KmzSecurityError(ValueError):
    """Raised when an archive violates a KMZ safety limit."""


def _limit(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return max(1, int(value))
    except ValueError as error:
        raise RuntimeError(f"{name} must be a positive integer") from error


KMZ_MAX_UPLOAD_SIZE = _limit("KMZ_MAX_UPLOAD_SIZE", 25 * 1024 * 1024)
KMZ_MAX_UNCOMPRESSED_SIZE = _limit("KMZ_MAX_UNCOMPRESSED_SIZE", 100 * 1024 * 1024)
KMZ_MAX_ENTRIES = _limit("KMZ_MAX_ENTRIES", 500)
KMZ_MAX_PLACEMARKS = _limit("KMZ_MAX_PLACEMARKS", 1_000)
KMZ_MAX_IMAGES = _limit("KMZ_MAX_IMAGES", 100)
KMZ_MAX_COMPRESSION_RATIO = _limit("KMZ_MAX_COMPRESSION_RATIO", 100)


@dataclass(frozen=True)
class ValidatedKmz:
    """The safe in-memory ZIP archive passed to the KML parser."""

    archive: zipfile.ZipFile
    entries: tuple[zipfile.ZipInfo, ...]


def validate_kmz_upload(filename: str | None, payload: bytes) -> ValidatedKmz:
    """Reject archives that are malformed, oversized or unsafe to inspect."""

    if not filename or not filename.lower().endswith(".kmz"):
        raise KmzSecurityError("Only .kmz files are accepted")
    if len(payload) == 0:
        raise KmzSecurityError("The KMZ file is empty")
    if len(payload) > KMZ_MAX_UPLOAD_SIZE:
        raise KmzSecurityError("The KMZ file exceeds the upload size limit")
    if not zipfile.is_zipfile(BytesIO(payload)):
        raise KmzSecurityError("The uploaded file is not a valid ZIP archive")

    try:
        archive = zipfile.ZipFile(BytesIO(payload))
    except zipfile.BadZipFile as error:
        raise KmzSecurityError("The uploaded file is not a valid ZIP archive") from error

    entries = tuple(info for info in archive.infolist() if not info.is_dir())
    if len(entries) > KMZ_MAX_ENTRIES:
        archive.close()
        raise KmzSecurityError("The KMZ archive contains too many files")

    total_size = 0
    for entry in entries:
        _validate_entry(entry)
        total_size += entry.file_size
        if total_size > KMZ_MAX_UNCOMPRESSED_SIZE:
            archive.close()
            raise KmzSecurityError("The KMZ archive expands beyond the allowed size")
        if entry.compress_size == 0 and entry.file_size > 0:
            archive.close()
            raise KmzSecurityError("The KMZ archive contains an invalid compressed entry")
        if entry.compress_size > 0 and entry.file_size / entry.compress_size > KMZ_MAX_COMPRESSION_RATIO:
            archive.close()
            raise KmzSecurityError("The KMZ archive compression ratio is too high")
        suffix = PurePosixPath(entry.filename).suffix.lower()
        if suffix in {".zip", ".kmz"}:
            archive.close()
            raise KmzSecurityError("Nested archives are not allowed in a KMZ file")

    return ValidatedKmz(archive=archive, entries=entries)


def _validate_entry(entry: zipfile.ZipInfo) -> None:
    path = PurePosixPath(entry.filename)
    mode = entry.external_attr >> 16
    if (
        not entry.filename
        or "\\" in entry.filename
        or path.is_absolute()
        or ".." in path.parts
        or any(part in {"", "."} for part in path.parts)
    ):
        raise KmzSecurityError("The KMZ archive contains an unsafe file path")
    if stat.S_ISLNK(mode):
        raise KmzSecurityError("Symbolic links are not allowed in a KMZ archive")
