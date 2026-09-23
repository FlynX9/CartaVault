from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MAX_AVATAR_SIZE = 5 * 1024 * 1024
MAX_AVATAR_DIMENSION = 4096


class AvatarError(ValueError):
    pass


def avatar_root() -> Path:
    configured = Path(os.getenv("AVATAR_STORAGE_PATH", "storage/avatars"))
    unresolved = configured.absolute() if configured.is_absolute() else (BACKEND_ROOT / configured).absolute()
    current = unresolved
    while current != current.parent:
        if current.is_symlink():
            raise AvatarError("Avatar storage must not use symbolic links")
        current = current.parent
    root = unresolved.resolve()
    if not configured.is_absolute():
        try: root.relative_to(BACKEND_ROOT)
        except ValueError as error: raise AvatarError("Avatar storage must stay inside the backend") from error
    return root


def new_avatar_filename() -> str:
    return f"{uuid4()}.webp"


def _validate_avatar_filename(filename: str) -> None:
    if Path(filename).name != filename or not filename.endswith(".webp"):
        raise AvatarError("Invalid avatar filename")
    try:
        avatar_id = UUID(filename.removesuffix(".webp"))
    except ValueError as error:
        raise AvatarError("Invalid avatar filename") from error
    if filename != f"{avatar_id}.webp":
        raise AvatarError("Invalid avatar filename")


def store_avatar(content: bytes, *, filename: str | None = None) -> str:
    if len(content) > MAX_AVATAR_SIZE:
        raise AvatarError("Avatar exceeds the 5 MiB limit")
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
        with Image.open(BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "is_animated", False):
                raise AvatarError("Only static JPEG, PNG and WebP avatars are supported")
            source.load()
            # Phone cameras commonly store portrait photos as landscape pixels
            # plus an EXIF orientation flag. Apply that flag before cropping;
            # otherwise the generated WebP is permanently saved sideways.
            oriented = ImageOps.exif_transpose(source)
            if oriented.width > MAX_AVATAR_DIMENSION or oriented.height > MAX_AVATAR_DIMENSION:
                raise AvatarError("Avatar dimensions exceed 4096 pixels")
            image = ImageOps.fit(oriented.convert("RGB"), (256, 256), method=Image.Resampling.LANCZOS)
            root = avatar_root(); root.mkdir(parents=True, exist_ok=True)
            filename = filename or new_avatar_filename()
            _validate_avatar_filename(filename)
            partial = root / f".{filename}.partial"
            image.save(partial, format="WEBP", quality=85, method=6, exif=b"")
            partial.replace(root / filename)
            return filename
    except ImportError as error:
        raise RuntimeError("Pillow is required for avatar processing") from error
    except (OSError, UnidentifiedImageError) as error:
        raise AvatarError("Avatar content is not a decodable image") from error


def resolve_avatar(filename: str) -> Path:
    _validate_avatar_filename(filename)
    path = (avatar_root() / filename).resolve()
    try: path.relative_to(avatar_root())
    except ValueError as error: raise AvatarError("Invalid avatar path") from error
    return path


def delete_avatar(filename: str | None) -> None:
    if not filename:
        return
    _validate_avatar_filename(filename)
    from app.photos.object_storage import LocalObjectStorage, ObjectStorageError

    try:
        LocalObjectStorage(avatar_root()).delete(filename)
    except ObjectStorageError as error:
        raise AvatarError("Unable to delete the avatar") from error
