from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from fastapi.responses import FileResponse

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.config import vector_basemap_settings


router = APIRouter(prefix="/basemaps/cartavault", tags=["basemaps"])
_RANGE_PATTERN = re.compile(r"^bytes=(\d*)-(\d*)$")
_CHUNK_SIZE = 1024 * 1024


def _archive() -> Path | None:
    path = vector_basemap_settings.archive_path
    return path if vector_basemap_settings.enabled and path.is_file() else None


def _headers(path: Path) -> dict[str, str]:
    stat = path.stat()
    return {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "ETag": f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"',
        "Content-Type": "application/vnd.pmtiles",
        "X-Content-Type-Options": "nosniff",
    }


def _parse_range(value: str, size: int) -> tuple[int, int]:
    match = _RANGE_PATTERN.fullmatch(value.strip())
    if match is None or "," in value:
        raise ValueError
    first, last = match.groups()
    if not first and not last:
        raise ValueError
    if not first:
        length = int(last)
        if length <= 0:
            raise ValueError
        return max(0, size - length), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        raise ValueError
    return start, end


def _stream(path: Path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with path.open("rb") as source:
        source.seek(start)
        while remaining:
            chunk = source.read(min(_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/config")
def config(_: User = Depends(get_current_user)) -> dict[str, object]:
    path = _archive()
    archive_url = "/basemaps/cartavault/archive.pmtiles"
    return {
        "available": path is not None,
        "archive_url": archive_url if path is not None else None,
        "glyphs_url": "/basemaps/cartavault/fonts/{fontstack}/{range}.pbf",
        "version": vector_basemap_settings.version,
        "min_zoom": vector_basemap_settings.min_zoom,
        "max_zoom": vector_basemap_settings.max_zoom,
        "offline_min_zoom": vector_basemap_settings.offline_min_zoom,
        "offline_max_zoom": vector_basemap_settings.offline_max_zoom,
        "offline_padding_km": vector_basemap_settings.offline_padding_km,
        "offline_max_tiles": vector_basemap_settings.offline_max_tiles,
        "attribution": "© OpenStreetMap contributors · OpenMapTiles · CartaVault",
    }


@router.api_route("/archive.pmtiles", methods=["GET", "HEAD"], name="cartavault_vector_archive")
def archive(
    range_header: str | None = Header(default=None, alias="Range"),
    _: User = Depends(get_current_user),
) -> Response:
    path = _archive()
    if path is None:
        raise HTTPException(404, {"code": "CARTAVAULT_BASEMAP_UNAVAILABLE", "message": "Le fond CartaVault n’est pas configuré."})
    size = path.stat().st_size
    headers = _headers(path)
    if range_header is None:
        headers["Content-Length"] = str(size)
        return StreamingResponse(_stream(path, 0, size - 1), headers=headers, media_type="application/vnd.pmtiles")
    try:
        start, end = _parse_range(range_header, size)
    except (ValueError, OverflowError):
        headers["Content-Range"] = f"bytes */{size}"
        return Response(status_code=416, headers=headers)
    headers.update({
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Content-Length": str(end - start + 1),
    })
    return StreamingResponse(_stream(path, start, end), status_code=206, headers=headers, media_type="application/vnd.pmtiles")


@router.get("/fonts/{fontstack}/{glyph_range}.pbf", name="cartavault_vector_font")
def font_glyphs(fontstack: str, glyph_range: str, _: User = Depends(get_current_user)) -> FileResponse:
    if not re.fullmatch(r"[A-Za-z0-9 _,-]{1,160}", fontstack) or not re.fullmatch(r"\d{1,6}-\d{1,6}", glyph_range):
        raise HTTPException(404)
    root = vector_basemap_settings.fonts_path.resolve()
    path = (root / fontstack / f"{glyph_range}.pbf").resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type="application/x-protobuf", headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
