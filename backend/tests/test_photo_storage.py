from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from app.photos.storage import (
    BACKEND_ROOT,
    MAX_PHOTO_SIZE,
    InvalidPhotoPathError,
    PhotoStorageError,
    PhotoTooLargeError,
    UnsupportedPhotoTypeError,
    delete_photo_file,
    get_photo_storage_root,
    normalize_original_name,
    resolve_photo_file,
    store_photo_file,
)


pytestmark = pytest.mark.unit


JPEG_BYTES = b"\xff\xd8\xff\xe0small-jpeg\xff\xd9"
PNG_BYTES = b"\x89PNG\r\n\x1a\nsmall-png"
WEBP_BYTES = b"RIFF\x04\x00\x00\x00WEBPsmall-webp"


class OversizedJpegStream:
    """Generate a 20 MiB + 1 byte JPEG-like stream one block at a time."""

    def __init__(self) -> None:
        self.position = 0
        self.size = MAX_PHOTO_SIZE + 1

    def seek(self, position: int) -> int:
        if position != 0:
            raise OSError("Only rewinding is supported")

        self.position = 0
        return self.position

    def read(self, size: int = -1) -> bytes:
        remaining = self.size - self.position

        if remaining <= 0:
            return b""

        read_size = remaining if size < 0 else min(size, remaining)

        if self.position == 0:
            data = b"\xff\xd8\xff" + b"0" * (read_size - 3)
        else:
            data = b"0" * read_size

        self.position += read_size
        return data


@pytest.mark.parametrize(
    ("media_type", "extension", "content"),
    [
        ("image/jpeg", ".jpg", JPEG_BYTES),
        ("image/png", ".png", PNG_BYTES),
        ("image/webp", ".webp", WEBP_BYTES),
    ],
)
def test_store_supported_images(
    photo_storage: Path,
    media_type: str,
    extension: str,
    content: bytes,
) -> None:
    place_id = uuid4()
    photo_id = uuid4()

    stored = store_photo_file(
        BytesIO(content),
        media_type,
        place_id,
        photo_id,
    )

    assert stored.filename == f"{photo_id}{extension}"
    assert stored.relative_path == f"{place_id}/{photo_id}{extension}"
    assert stored.absolute_path.read_bytes() == content
    assert stored.absolute_path.is_relative_to(photo_storage)

    assert delete_photo_file(
        stored.relative_path,
        place_id,
        photo_id,
    )
    assert not stored.absolute_path.exists()


def test_rejects_fake_jpeg(photo_storage: Path) -> None:
    with pytest.raises(UnsupportedPhotoTypeError):
        store_photo_file(
            BytesIO(b"not-an-image"),
            "image/jpeg",
            uuid4(),
            uuid4(),
        )

    assert not any(photo_storage.rglob("*"))


def test_rejects_unsupported_mime_type(photo_storage: Path) -> None:
    with pytest.raises(UnsupportedPhotoTypeError):
        store_photo_file(
            BytesIO(b"GIF89a"),
            "image/gif",
            uuid4(),
            uuid4(),
        )

    assert not any(photo_storage.rglob("*"))


def test_rejects_oversized_file_and_removes_partial_file(
    photo_storage: Path,
) -> None:
    with pytest.raises(PhotoTooLargeError):
        store_photo_file(
            OversizedJpegStream(),  # type: ignore[arg-type]
            "image/jpeg",
            uuid4(),
            uuid4(),
        )

    assert not [path for path in photo_storage.rglob("*") if path.is_file()]


@pytest.mark.parametrize(
    ("supplied_name", "expected_name"),
    [
        (r"C:\client\photo.jpg", "photo.jpg"),
        ("../client/photo.png", "photo.png"),
        ("photo.webp", "photo.webp"),
        ("..", None),
    ],
)
def test_normalizes_original_filename(
    supplied_name: str,
    expected_name: str | None,
) -> None:
    assert normalize_original_name(supplied_name) == expected_name


@pytest.mark.parametrize(
    "unsafe_path",
    [
        "../outside.jpg",
        r"..\outside.jpg",
        "/absolute/outside.jpg",
        r"C:\absolute\outside.jpg",
        r"\\server\share\outside.jpg",
    ],
)
def test_rejects_unsafe_stored_paths(
    photo_storage: Path,
    unsafe_path: str,
) -> None:
    with pytest.raises(InvalidPhotoPathError):
        resolve_photo_file(
            unsafe_path,
            uuid4(),
            uuid4(),
            require_file=False,
        )


def test_rejects_path_with_mismatched_uuid(photo_storage: Path) -> None:
    place_id = uuid4()
    photo_id = uuid4()
    mismatched_path = f"{uuid4()}/{photo_id}.jpg"

    with pytest.raises(InvalidPhotoPathError):
        resolve_photo_file(
            mismatched_path,
            place_id,
            photo_id,
            require_file=False,
        )


def test_rejects_relative_storage_root_outside_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PHOTO_STORAGE_PATH", "../../outside")

    with pytest.raises(PhotoStorageError):
        get_photo_storage_root()


def test_relative_storage_root_does_not_depend_on_current_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("PHOTO_STORAGE_PATH", "storage/photos")

    assert get_photo_storage_root() == (
        BACKEND_ROOT / "storage/photos"
    ).resolve()
