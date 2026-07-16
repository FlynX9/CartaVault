from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.categories.associations import place_categories_table
from app.categories.icon_catalog import get_category_icon_entry
from app.categories.models import Category
from app.exports.kml_serializer import build_kml, safe_description
from app.exports.marker_icons import build_marker_png
from app.exports.schemas import KmzExportOptions, KmzExportReport
from app.exports.temporary_exports import TemporaryExport, create
from app.maps.models import PoiMap
from app.photos.storage import PhotoStorageError, get_photo_media_type, resolve_photo_file
from app.places.models import Place


MAX_PLACES = 10_000
MAX_IMAGES = 2_000
MAX_TOTAL_SIZE = 500 * 1024 * 1024


def create_kmz_export(session: Session, map_id: UUID, user_id: UUID, options: KmzExportOptions) -> tuple[TemporaryExport, KmzExportReport]:
    poi_map = session.get(PoiMap, map_id)
    if poi_map is None:
        raise HTTPException(status_code=404, detail="Map not found")
    total = session.scalar(select(func.count()).select_from(Place).where(Place.map_id == map_id)) or 0
    statement = select(Place).where(Place.map_id == map_id).options(selectinload(Place.categories), selectinload(Place.tags), selectinload(Place.photos), selectinload(Place.status))
    if options.category_ids:
        statement = statement.where(Place.categories.any(Place.categories.property.mapper.class_.id.in_(options.category_ids)))
    if options.status_ids:
        statement = statement.where(Place.status_id.in_(options.status_ids))
    places = session.scalars(statement.order_by(func.lower(Place.name), Place.id).limit(MAX_PLACES + 1)).all()
    if len(places) > MAX_PLACES:
        raise HTTPException(status_code=422, detail="Too many places for one KMZ export")
    warnings: list[str] = []
    placemarks: list[dict[str, object]] = []
    images: list[tuple[Path, str]] = []
    styles: dict[str, str] = {}
    marker_styles: dict[str, tuple[str, str, str | None]] = {}
    custom_count = skipped = skipped_images = 0
    for place in places:
        coordinates = session.execute(select(func.ST_X(Place.location), func.ST_Y(Place.location)).where(Place.id == place.id)).one()
        longitude, latitude = coordinates
        if longitude is None or latitude is None:
            skipped += 1; warnings.append(f"{place.name}: missing coordinates"); continue
        primary = next((photo for photo in place.photos if photo.is_primary), None) or (place.photos[0] if place.photos else None)
        image_path = None
        if options.include_images:
            for index, photo in enumerate(place.photos, 1):
                if len(images) >= MAX_IMAGES: skipped_images += 1; warnings.append("Image export limit reached"); break
                try:
                    source = resolve_photo_file(photo.path or "", place.id, photo.id, require_file=True)
                    extension = get_photo_media_type(source)
                    relative = f"files/{place.id}/{index:03d}-{photo.id}{source.suffix}"
                    images.append((source, relative))
                    if primary and photo.id == primary.id: image_path = relative
                except PhotoStorageError:
                    skipped_images += 1; warnings.append(f"{place.name}: missing or unsafe image")
        data: dict[str, object] = {}
        selected = set(options.fields)
        primary_category = session.scalar(
            select(Category)
            .join(place_categories_table, place_categories_table.c.category_id == Category.id)
            .where(
                place_categories_table.c.place_id == place.id,
                place_categories_table.c.is_primary.is_(True),
            )
        ) or next(iter(place.categories), None)
        category_group = (
            get_category_icon_entry(primary_category.icon).group
            if primary_category and get_category_icon_entry(primary_category.icon)
            else "other"
        )
        status_color = place.status.color if place.status else "#64707A"
        style_id = f"marker-{str(place.status_id or 'default').replace('-', '')}-{category_group}"
        styles.setdefault(style_id, f"icons/{style_id}.png")
        marker_styles.setdefault(
            style_id,
            (status_color, category_group, primary_category.icon if primary_category else None),
        )
        values = {
            "description": place.description, "region": place.region, "construction_date": place.construction_date,
            "abandonment_date": place.abandonment_date, "condition": place.condition, "access": place.access,
            "danger_level": place.danger_level, "status": place.status.name if place.status else None,
            "primary_category": primary_category.name if primary_category else None,
            "categories": [category.name for category in place.categories], "tags": [tag.name for tag in place.tags],
            "created_at": place.created_at.isoformat(), "updated_at": place.updated_at.isoformat(),
        }
        for key, value in values.items():
            if key in selected and value not in (None, [], ""): data[f"cartavault:{key}"] = value
        if options.include_custom_fields:
            for key, value in (place.custom_fields or {}).items(): data[f"custom:{key}"] = value; custom_count += 1
        placemarks.append({"name": place.name, "longitude": longitude, "latitude": latitude, "description": safe_description(place.description if "description" in selected else None, image_path), "extended_data": data, "style_id": style_id})
    if not placemarks:
        raise HTTPException(status_code=422, detail="No exportable places match the selected filters")
    file_name = _file_name(poi_map.name)
    temporary = create(map_id, user_id, file_name)
    with ZipFile(temporary.path, "w", ZIP_DEFLATED, allowZip64=False) as archive:
        archive.writestr("doc.kml", build_kml(poi_map.name, placemarks, styles))
        for style_id, (color, group, icon_id) in marker_styles.items():
            archive.writestr(styles[style_id], build_marker_png(color, group, icon_id))
        for source, relative in images:
            if temporary.path.stat().st_size + source.stat().st_size > MAX_TOTAL_SIZE: skipped_images += 1; warnings.append("KMZ size limit reached"); break
            archive.write(source, relative)
    report = KmzExportReport(map_id=map_id, map_name=poi_map.name, total_places_in_map=total, exported_places=len(placemarks), filtered_places=total - len(places), skipped_places=skipped, included_images=len(images) - skipped_images, skipped_images=skipped_images, custom_fields_count=custom_count, warnings=warnings, errors=[], file_size=temporary.path.stat().st_size, generated_at=datetime.now(UTC))
    return temporary, report


def _file_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80] or "carte"
    return f"cartavault-{slug}-{datetime.now().date().isoformat()}.kmz"
