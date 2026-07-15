"""Small self-contained PNG markers for offline KML category/status styles."""

from __future__ import annotations

import struct
import zlib


def build_marker_png(color: str, group: str, icon_id: str | None = None) -> bytes:
    red, green, blue = _rgb(color)
    size = 24
    pixels = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    for y in range(size):
        for x in range(size):
            if (x - 11.5) ** 2 + (y - 10.5) ** 2 <= 9.5 ** 2:
                pixels[y][x] = (red, green, blue, 255)
    points = _glyph_points(group, icon_id or "")
    for x, y in points:
        if 0 <= x < size and 0 <= y < size:
            pixels[y][x] = (255, 255, 255, 255)
    raw = b"".join(b"\x00" + bytes(channel for pixel in row for channel in pixel) for row in pixels)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")


def _glyph_points(group: str, icon_id: str) -> set[tuple[int, int]]:
    """Return a compact, category-specific glyph without external icon URLs."""
    if icon_id == "mdi:church":
        # Nave, pointed roof and steeple: recognisable at the small KML size.
        body = {(x, y) for x in range(7, 17) for y in range(11, 17)}
        roof = {(x, y) for y, width in ((7, 1), (8, 3), (9, 5), (10, 7)) for x in range(12 - width // 2, 12 - width // 2 + width)}
        steeple = {(11, y) for y in range(4, 8)} | {(x, 5) for x in range(10, 13)}
        windows = {(9, 13), (14, 13)}
        return body | roof | steeple | windows
    if icon_id in {"mdi:home-outline", "mdi:hotel", "mdi:garage"}:
        roof = {(x, y) for y, width in ((7, 2), (8, 4), (9, 6), (10, 8)) for x in range(12 - width // 2, 12 - width // 2 + width)}
        return roof | {(x, y) for x in range(8, 16) for y in range(11, 17) if x in {8, 15} or y == 16}
    if icon_id in {"mdi:pine-tree", "mdi:terrain", "mdi:image-filter-hdr"}:
        return {(12, y) for y in range(6, 18)} | {(x, y) for y, width in ((8, 3), (10, 5), (12, 7), (14, 9)) for x in range(12 - width // 2, 12 - width // 2 + width)}
    if icon_id in {"mdi:bank-outline", "mdi:castle", "mdi:museum"}:
        roof = {(x, y) for y, width in ((7, 3), (8, 5), (9, 7)) for x in range(12 - width // 2, 12 - width // 2 + width)}
        columns = {(x, y) for x in (8, 10, 13, 15) for y in range(10, 16)}
        return roof | columns | {(x, 16) for x in range(7, 17)}
    # Compact semantic fallbacks for categories without a dedicated raster glyph.
    if group == "religion":
        points = {(11, y) for y in range(5, 17)} | {(x, 10) for x in range(7, 16)}
    elif group == "nature":
        points = {(x, 16 - x // 2) for x in range(7, 17)} | {(x, 5 + x // 2) for x in range(7, 17)}
    elif group in {"buildings", "industry", "education", "culture"}:
        points = {(x, y) for x in range(7, 17) for y in range(7, 17) if x in {7, 16} or y in {7, 16}}
    else:
        points = {(x, y) for x in range(9, 15) for y in range(9, 15)}
    return points


def _chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def _rgb(color: str) -> tuple[int, int, int]:
    value = color.lstrip("#")
    if len(value) != 6:
        return 100, 112, 122
    try:
        return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
    except ValueError:
        return 100, 112, 122
