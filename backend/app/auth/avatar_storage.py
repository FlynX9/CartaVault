from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path
from uuid import uuid4

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MAX_AVATAR_SIZE = 5 * 1024 * 1024
MAX_AVATAR_DIMENSION = 4096


class AvatarError(ValueError):
    pass


def avatar_root() -> Path:
    configured = Path(os.getenv("AVATAR_STORAGE_PATH", "storage/avatars"))
    root = configured.resolve() if configured.is_absolute() else (BACKEND_ROOT / configured).resolve()
    if not configured.is_absolute():
        try: root.relative_to(BACKEND_ROOT)
        except ValueError as error: raise AvatarError("Avatar storage must stay inside the backend") from error
    return root


def store_avatar(content: bytes) -> str:
    if len(content) > MAX_AVATAR_SIZE:
        raise AvatarError("Avatar exceeds the 5 MiB limit")
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
        with Image.open(BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "is_animated", False):
                raise AvatarError("Only static JPEG, PNG and WebP avatars are supported")
            if source.width > MAX_AVATAR_DIMENSION or source.height > MAX_AVATAR_DIMENSION:
                raise AvatarError("Avatar dimensions exceed 4096 pixels")
            source.load()
            image = ImageOps.fit(source.convert("RGB"), (256, 256), method=Image.Resampling.LANCZOS)
            root = avatar_root(); root.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid4()}.webp"; partial = root / f".{filename}.partial"
            image.save(partial, format="WEBP", quality=85, method=6, exif=b"")
            partial.replace(root / filename)
            return filename
    except ImportError as error:
        raise RuntimeError("Pillow is required for avatar processing") from error
    except (OSError, UnidentifiedImageError) as error:
        raise AvatarError("Avatar content is not a decodable image") from error


def resolve_avatar(filename: str) -> Path:
    if Path(filename).name != filename or not filename.endswith(".webp"):
        raise AvatarError("Invalid avatar filename")
    path = (avatar_root() / filename).resolve()
    try: path.relative_to(avatar_root())
    except ValueError as error: raise AvatarError("Invalid avatar path") from error
    return path


def delete_avatar(filename: str | None) -> None:
    if filename: resolve_avatar(filename).unlink(missing_ok=True)
