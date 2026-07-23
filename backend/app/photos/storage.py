import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import BinaryIO
from uuid import UUID

from dotenv import load_dotenv
from PIL import Image, ImageOps, UnidentifiedImageError


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PHOTO_STORAGE_PATH = Path("storage/photos")
MAX_PHOTO_SIZE = 20 * 1024 * 1024
PHOTO_CHUNK_SIZE = 1024 * 1024
THUMBNAIL_MAX_SIZE = (640, 480)

ALLOWED_PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

load_dotenv(BACKEND_ROOT / ".env")


class PhotoStorageError(Exception):
    """Base error raised by local photo storage operations."""


class UnsupportedPhotoTypeError(PhotoStorageError):
    """Raised when multipart metadata or binary content is unsupported."""


class PhotoTooLargeError(PhotoStorageError):
    """Raised as soon as an upload exceeds the configured size limit."""


class InvalidPhotoPathError(PhotoStorageError):
    """Raised when a stored database path is unsafe or inconsistent."""


class PhotoFileNotFoundError(PhotoStorageError):
    """Raised when metadata points to a missing physical file."""


@dataclass(frozen=True)
class StoredPhoto:
    """Safe paths and metadata generated for one stored upload."""

    filename: str
    relative_path: str
    absolute_path: Path
    media_type: str
    file_size_bytes: int
    width: int | None
    height: int | None


@dataclass(frozen=True)
class PhotoFileMetadata:
    media_type: str
    file_size_bytes: int
    width: int | None
    height: int | None


def get_photo_storage_root() -> Path:
    """Resolve the configured storage root independently of the current cwd."""

    configured_path = Path(
        os.getenv(
            "PHOTO_STORAGE_PATH",
            str(DEFAULT_PHOTO_STORAGE_PATH),
        )
    )

    if configured_path.is_absolute():
        return configured_path.resolve()

    storage_root = (BACKEND_ROOT / configured_path).resolve()

    try:
        storage_root.relative_to(BACKEND_ROOT)
    except ValueError as error:
        raise PhotoStorageError(
            "Relative PHOTO_STORAGE_PATH must stay inside the backend directory"
        ) from error

    return storage_root


def detect_photo_media_type(header: bytes) -> str | None:
    """Detect one of the supported image types from its binary signature."""

    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"

    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"

    if (
        len(header) >= 12
        and header.startswith(b"RIFF")
        and header[8:12] == b"WEBP"
    ):
        return "image/webp"

    return None


def normalize_original_name(original_name: str | None) -> str | None:
    """Keep only the display filename supplied by the multipart client."""

    if not original_name:
        return None

    filename = PureWindowsPath(original_name).name
    filename = PurePosixPath(filename).name

    return filename if filename not in {"", ".", ".."} else None


def store_photo_file(
    source: BinaryIO,
    content_type: str | None,
    place_id: UUID,
    photo_id: UUID,
) -> StoredPhoto:
    """Validate and stream one image to its generated storage location."""

    expected_extension = ALLOWED_PHOTO_TYPES.get(content_type or "")

    if expected_extension is None:
        raise UnsupportedPhotoTypeError(
            "Only JPEG, PNG and WebP images are supported"
        )

    try:
        source.seek(0)
        first_chunk = source.read(PHOTO_CHUNK_SIZE)
    except OSError as error:
        raise PhotoStorageError("Unable to read the uploaded image") from error

    detected_type = detect_photo_media_type(first_chunk[:16])

    if detected_type != content_type:
        raise UnsupportedPhotoTypeError(
            "The uploaded file content does not match an allowed image type"
        )

    storage_root = get_photo_storage_root()
    unresolved_place_directory = storage_root / str(place_id)

    if unresolved_place_directory.is_symlink():
        raise PhotoStorageError("The photo directory must not be a symbolic link")

    place_directory = unresolved_place_directory.resolve()

    try:
        place_directory.relative_to(storage_root)
    except ValueError as error:
        raise PhotoStorageError("Unable to create a safe photo directory") from error

    filename = f"{photo_id}{expected_extension}"
    final_path = place_directory / filename
    partial_path = place_directory / f".{filename}.partial"
    total_size = 0

    try:
        place_directory.mkdir(parents=True, exist_ok=True)

        with partial_path.open("xb") as destination:
            chunk = first_chunk

            while chunk:
                total_size += len(chunk)

                if total_size > MAX_PHOTO_SIZE:
                    raise PhotoTooLargeError(
                        "The uploaded image exceeds the 20 MiB limit"
                    )

                destination.write(chunk)
                chunk = source.read(PHOTO_CHUNK_SIZE)

        partial_path.replace(final_path)

    except PhotoStorageError:
        partial_path.unlink(missing_ok=True)
        _remove_directory_if_empty(place_directory, storage_root)
        raise

    except OSError as error:
        partial_path.unlink(missing_ok=True)
        _remove_directory_if_empty(place_directory, storage_root)
        raise PhotoStorageError("Unable to store the uploaded image") from error

    relative_path = PurePosixPath(str(place_id), filename).as_posix()
    dimensions = read_photo_dimensions(final_path)

    return StoredPhoto(
        filename=filename,
        relative_path=relative_path,
        absolute_path=final_path,
        media_type=detected_type,
        file_size_bytes=total_size,
        width=dimensions[0],
        height=dimensions[1],
    )


def read_photo_dimensions(file_path: Path) -> tuple[int | None, int | None]:
    """Read image dimensions without trusting client-provided metadata."""

    try:
        with Image.open(file_path) as image:
            image.verify()
        with Image.open(file_path) as image:
            return image.size
    except (OSError, UnidentifiedImageError):
        # Legacy signature-only test files and damaged images remain diagnosable.
        return (None, None)


def inspect_photo_file(
    relative_path: str,
    place_id: UUID,
    photo_id: UUID,
) -> PhotoFileMetadata:
    """Return safe technical metadata for one stored photo."""

    file_path = resolve_photo_file(
        relative_path,
        place_id,
        photo_id,
        require_file=True,
    )
    width, height = read_photo_dimensions(file_path)
    return PhotoFileMetadata(
        media_type=get_photo_media_type(file_path),
        file_size_bytes=file_path.stat().st_size,
        width=width,
        height=height,
    )


def get_photo_thumbnail(
    relative_path: str,
    place_id: UUID,
    photo_id: UUID,
) -> Path:
    """Return a deterministic, metadata-stripped WebP thumbnail."""

    source_path = resolve_photo_file(
        relative_path,
        place_id,
        photo_id,
        require_file=True,
    )
    storage_root = get_photo_storage_root()
    thumbnail_directory = (storage_root / ".thumbnails").resolve()
    thumbnail_path = (thumbnail_directory / f"{photo_id}.webp").resolve()
    try:
        thumbnail_path.relative_to(thumbnail_directory)
    except ValueError as error:
        raise PhotoStorageError("Unable to create a safe thumbnail path") from error

    if (
        thumbnail_path.is_file()
        and thumbnail_path.stat().st_mtime_ns >= source_path.stat().st_mtime_ns
    ):
        return thumbnail_path

    temporary_path = thumbnail_path.with_suffix(".partial")
    try:
        thumbnail_directory.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as source:
            image = ImageOps.exif_transpose(source)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGB")
            image.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
            image.save(
                temporary_path,
                format="WEBP",
                quality=82,
                method=6,
                exif=b"",
                icc_profile=None,
            )
        temporary_path.replace(thumbnail_path)
        return thumbnail_path
    except (OSError, UnidentifiedImageError) as error:
        temporary_path.unlink(missing_ok=True)
        raise PhotoStorageError("Unable to generate the photo thumbnail") from error


def delete_photo_thumbnail(photo_id: UUID) -> None:
    """Delete a generated derivative without touching source media."""

    thumbnail_directory = (get_photo_storage_root() / ".thumbnails").resolve()
    thumbnail_path = (thumbnail_directory / f"{photo_id}.webp").resolve()
    try:
        thumbnail_path.relative_to(thumbnail_directory)
        thumbnail_path.unlink(missing_ok=True)
    except (OSError, ValueError) as error:
        raise PhotoStorageError("Unable to delete the photo thumbnail") from error


def resolve_photo_file(
    relative_path: str,
    place_id: UUID,
    photo_id: UUID,
    *,
    require_file: bool,
) -> Path:
    """Resolve and validate a database path without escaping storage."""

    windows_path = PureWindowsPath(relative_path)
    posix_path = PurePosixPath(relative_path)

    if (
        not relative_path
        or "\\" in relative_path
        or windows_path.drive
        or windows_path.is_absolute()
        or posix_path.is_absolute()
        or len(posix_path.parts) != 2
        or any(part in {"", ".", ".."} for part in posix_path.parts)
    ):
        raise InvalidPhotoPathError("The stored photo path is invalid")

    stored_place_id, stored_filename = posix_path.parts

    try:
        parsed_place_id = UUID(stored_place_id)
        parsed_photo_id = UUID(Path(stored_filename).stem)
    except ValueError as error:
        raise InvalidPhotoPathError("The stored photo path is invalid") from error

    if (
        parsed_place_id != place_id
        or parsed_photo_id != photo_id
        or Path(stored_filename).suffix not in ALLOWED_PHOTO_TYPES.values()
    ):
        raise InvalidPhotoPathError(
            "The stored photo path does not match its metadata"
        )

    storage_root = get_photo_storage_root()
    unresolved_directory = storage_root / stored_place_id
    unresolved_path = unresolved_directory / stored_filename

    if unresolved_directory.is_symlink() or unresolved_path.is_symlink():
        raise InvalidPhotoPathError(
            "Stored photo paths must not use symbolic links"
        )

    absolute_path = unresolved_path.resolve()

    try:
        absolute_path.relative_to(storage_root)
    except ValueError as error:
        raise InvalidPhotoPathError(
            "The stored photo path escapes the storage directory"
        ) from error

    if require_file and not absolute_path.is_file():
        raise PhotoFileNotFoundError("The physical photo file was not found")

    return absolute_path


def get_photo_media_type(file_path: Path) -> str:
    """Return the MIME type associated with a generated file extension."""

    for media_type, extension in ALLOWED_PHOTO_TYPES.items():
        if file_path.suffix == extension:
            return media_type

    raise InvalidPhotoPathError("The stored photo extension is invalid")


def delete_photo_file(
    relative_path: str,
    place_id: UUID,
    photo_id: UUID,
) -> bool:
    """Delete a safe stored file and its now-empty place directory."""

    file_path = resolve_photo_file(
        relative_path,
        place_id,
        photo_id,
        require_file=False,
    )
    storage_root = get_photo_storage_root()

    if not file_path.exists():
        _remove_directory_if_empty(file_path.parent, storage_root)
        return False

    if not file_path.is_file():
        raise InvalidPhotoPathError("The stored photo path is not a file")

    try:
        file_path.unlink()
        _remove_directory_if_empty(file_path.parent, storage_root)
    except OSError as error:
        raise PhotoStorageError("Unable to delete the physical photo file") from error

    return True


def _remove_directory_if_empty(directory: Path, storage_root: Path) -> None:
    """Remove only a direct, empty child directory of the storage root."""

    if directory.parent != storage_root:
        return

    try:
        directory.rmdir()
    except FileNotFoundError:
        return
    except OSError:
        return
