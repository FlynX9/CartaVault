from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import asdict
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User
from app.basemaps.vector_catalog import VECTOR_COUNTRY_CATALOG, vector_country_source
from app.basemaps.vector_models import VectorBasemap
from app.basemaps.vector_service import archive_path, delete_vector_basemap, ensure_catalog_rows, maybe_prepare_for_policy, request_vector_basemap
from app.basemaps.vector_settings import VectorBasemapPolicy, get_vector_basemap_policy, set_vector_basemap_policy
from app.config import vector_basemap_settings
from app.countries.models import Country
from app.database import get_db
from app.maps.models import PoiMap
from app.tasks.models import BackgroundTask
from app.tasks.service import cancel_task


router = APIRouter(prefix="/basemaps/cartavault", tags=["basemaps"])
admin_router = APIRouter(prefix="/admin/console/vector-basemaps", tags=["admin-console"], dependencies=[Depends(require_admin)])
_RANGE_PATTERN = re.compile(r"^bytes=(\d*)-(\d*)$")
_CHUNK_SIZE = 1024 * 1024


class VectorPolicyPayload(BaseModel):
    enabled: bool = True
    preparation_policy: Literal["on_map_creation", "on_first_cartavault_use", "on_first_offline_use", "manual"] = "on_first_cartavault_use"
    update_policy: Literal["disabled", "monthly", "quarterly"] = "disabled"
    min_zoom: int = Field(default=0, ge=0, le=14)
    max_zoom: int = Field(default=14, ge=1, le=16)
    offline_min_zoom: int = Field(default=5, ge=0, le=16)
    offline_max_zoom: int = Field(default=14, ge=1, le=16)
    offline_padding_km: int = Field(default=20, ge=0, le=500)
    offline_max_tiles: int = Field(default=25_000, ge=100, le=250_000)

    @model_validator(mode="after")
    def validate_zooms(self):
        if not self.min_zoom <= self.offline_min_zoom <= self.offline_max_zoom <= self.max_zoom:
            raise ValueError("Les zooms hors ligne doivent être compris dans la plage du fond.")
        return self


def _headers(path: Path) -> dict[str, str]:
    stat = path.stat()
    return {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "ETag": f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"', "Content-Type": "application/vnd.pmtiles", "X-Content-Type-Options": "nosniff"}


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


def _config_payload(policy: VectorBasemapPolicy, row: VectorBasemap | None) -> dict[str, object]:
    path = archive_path(row) if row else None
    code = row.country_code if row else None
    return {
        "enabled": policy.enabled, "available": path is not None,
        "country_code": code, "country_name": row.country_name if row else None,
        "state": row.state if row else "unsupported", "phase": row.phase if row else None,
        "error_code": row.last_error_code if row else "UNSUPPORTED_COUNTRY",
        "error_message": row.last_error_message if row else "Fond automatique non disponible pour ce pays.",
        "archive_url": f"/basemaps/cartavault/archive/{code.lower()}.pmtiles" if path and code else None,
        "glyphs_url": "/basemaps/cartavault/fonts/{fontstack}/{range}.pbf",
        "version": row.version if row and row.version else "not-installed",
        "min_zoom": row.min_zoom if row and row.min_zoom is not None else policy.min_zoom,
        "max_zoom": row.max_zoom if row and row.max_zoom is not None else policy.max_zoom,
        "offline_min_zoom": policy.offline_min_zoom, "offline_max_zoom": policy.offline_max_zoom,
        "offline_padding_km": policy.offline_padding_km, "offline_max_tiles": policy.offline_max_tiles,
        "attribution": "© OpenStreetMap contributors · OpenMapTiles · CartaVault",
    }


@router.get("/config")
def config(country_code: str | None = Query(default=None, min_length=2, max_length=2), purpose: Literal["status", "online", "offline"] = "status", session: Session = Depends(get_db), current: User = Depends(get_current_user)) -> dict[str, object]:
    policy = get_vector_basemap_policy(session)
    if country_code is None:
        return _config_payload(policy, None)
    code = country_code.upper()
    row = maybe_prepare_for_policy(session, code, current.id, "offline_use" if purpose == "offline" else "cartavault_use") if purpose != "status" else session.get(VectorBasemap, code)
    return _config_payload(policy, row)


@router.head("/archive/{country_code}.pmtiles", include_in_schema=False)
@router.get("/archive/{country_code}.pmtiles", name="cartavault_vector_archive")
def archive(country_code: str, range_header: str | None = Header(default=None, alias="Range"), _: User = Depends(get_current_user), session: Session = Depends(get_db)) -> Response:
    if not re.fullmatch(r"[a-zA-Z]{2}", country_code):
        raise HTTPException(404)
    row = session.get(VectorBasemap, country_code.upper())
    path = archive_path(row) if row else None
    if path is None:
        raise HTTPException(404, {"code": "CARTAVAULT_BASEMAP_UNAVAILABLE", "message": "Le fond CartaVault n’est pas disponible pour ce pays."})
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
    headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(end - start + 1)})
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


def _admin_item(session: Session, row: VectorBasemap, map_count: int | None = None) -> dict[str, object]:
    maps = map_count if map_count is not None else session.scalar(select(func.count()).select_from(PoiMap).join(Country, PoiMap.country_id == Country.id).where(Country.iso_alpha2 == row.country_code, PoiMap.deleted_at.is_(None))) or 0
    phase = row.phase
    progress = row.progress
    if row.state in {"downloading", "generating", "validating", "deleting"} and row.task_id is not None:
        task = session.get(BackgroundTask, row.task_id)
        if task is not None:
            total = max(1, task.progress_total)
            progress = round(min(max(0, task.progress_current), total) * 100 / total)
            phase = task.progress_message or phase
    return {
        "country_code": row.country_code, "country_name": row.country_name, "state": row.state, "phase": phase,
        "progress": progress, "version": row.version, "file_size": row.file_size, "source_size": row.source_size,
        "installed_at": row.installed_at, "source_date": row.source_date, "min_zoom": row.min_zoom, "max_zoom": row.max_zoom,
        "schema": row.schema, "error_code": row.last_error_code, "error_message": row.last_error_message,
        "task_id": row.task_id, "map_count": int(maps), "supported": vector_country_source(row.country_code) is not None,
    }


@admin_router.get("")
def admin_library(session: Session = Depends(get_db)) -> dict[str, object]:
    ensure_catalog_rows(session); session.commit()
    rows = session.scalars(select(VectorBasemap).order_by(VectorBasemap.country_name)).all()
    map_counts = dict(session.execute(
        select(Country.iso_alpha2, func.count(PoiMap.id))
        .outerjoin(PoiMap, (PoiMap.country_id == Country.id) & PoiMap.deleted_at.is_(None))
        .group_by(Country.iso_alpha2)
    ).all())
    return {"settings": asdict(get_vector_basemap_policy(session)), "items": [_admin_item(session, row, int(map_counts.get(row.country_code, 0))) for row in rows]}


@admin_router.put("/settings")
def update_settings(payload: VectorPolicyPayload, session: Session = Depends(get_db)) -> dict[str, object]:
    return asdict(set_vector_basemap_policy(session, VectorBasemapPolicy(**payload.model_dump())))


@admin_router.post("/{country_code}/install", status_code=status.HTTP_202_ACCEPTED)
def install(country_code: str, session: Session = Depends(get_db), admin: User = Depends(require_admin)) -> dict[str, object]:
    if vector_country_source(country_code) is None:
        raise HTTPException(422, {"code": "UNSUPPORTED_COUNTRY", "message": "Fond automatique non disponible pour ce pays."})
    row, task = request_vector_basemap(session, country_code, admin.id, reason="manual_install")
    assert row is not None
    return {"item": _admin_item(session, row), "task_id": task.id if task else None}


@admin_router.post("/{country_code}/update", status_code=status.HTTP_202_ACCEPTED)
def update_country(country_code: str, session: Session = Depends(get_db), admin: User = Depends(require_admin)) -> dict[str, object]:
    if vector_country_source(country_code) is None:
        raise HTTPException(422, {"code": "UNSUPPORTED_COUNTRY", "message": "Fond automatique non disponible pour ce pays."})
    row, task = request_vector_basemap(session, country_code, admin.id, reason="manual_update", force=True)
    assert row is not None
    return {"item": _admin_item(session, row), "task_id": task.id if task else None}


@admin_router.post("/{country_code}/cancel")
def cancel(country_code: str, session: Session = Depends(get_db)) -> dict[str, object]:
    row = session.get(VectorBasemap, country_code.upper())
    task = session.get(BackgroundTask, row.task_id) if row and row.task_id else None
    if task is not None:
        cancel_task(session, task)
    if row is not None and task is not None and task.status == "cancelled":
        row.state = "error"; row.phase = "Annulé"; row.last_error_code = "CANCELLED"; row.last_error_message = "La préparation a été annulée."
        session.commit()
    return {"item": _admin_item(session, row)} if row else {"item": None}


@admin_router.delete("/{country_code}")
def remove(country_code: str, session: Session = Depends(get_db)) -> dict[str, object]:
    row = session.get(VectorBasemap, country_code.upper())
    if row is None:
        raise HTTPException(404)
    try:
        maps = delete_vector_basemap(session, country_code)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return {"country_code": country_code.upper(), "map_count": maps, "state": "not_installed"}
