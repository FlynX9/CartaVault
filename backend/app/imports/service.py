"""Preview cache and transactional persistence for KMZ imports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
import os
from pathlib import Path
from typing import Callable
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.categories.associations import place_categories_table
from app.categories.icon_catalog import DEFAULT_CATEGORY_ICON_ID
from app.categories.models import IMPORTED_CATEGORY_NAME, Category
from app.countries.point_validator import validate_point_country
from app.imports.kmz_mapping import map_extended_data
from app.imports.kmz_parser import ParsedImage, ParsedPlacemark
from app.imports.kmz_parser import KmzParseError, parse_kmz
from app.imports.kmz_security import KmzSecurityError, validate_kmz_upload
from app.imports.schemas import (
    KmzImagePreview,
    KmzImportFailure,
    KmzImportItemPreview,
    KmzImportReport,
    KmzPreviewRead,
)
from app.maps.models import PoiMap
from app.media.settings import get_media_upload_policy
from app.photos.models import Photo
from app.photos.storage import PhotoStorageError, delete_photo_file, store_photo_file
from app.imports.remote_images import RemoteImageError, download_remote_image
from app.places.models import Place, PlaceLink
from app.places.schemas import PlaceLinkCreate
from app.statuses.models import PlaceStatus
from app.statuses.router import slugify_status_name
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.tasks.models import KmzImportPreview


IMPORT_TTL = timedelta(minutes=15)
ProgressCallback = Callable[[int, int, str], None]
DEFAULT_IMPORT_ROOT = Path(__file__).resolve().parents[2] / "storage" / "imports"
IMPORT_ROOT = Path(os.getenv("IMPORT_STORAGE_PATH", str(DEFAULT_IMPORT_ROOT))).expanduser().resolve()


@dataclass(frozen=True)
class CachedKmzImport:
    import_id: UUID
    map_id: UUID
    user_id: UUID
    file_name: str
    created_at: datetime
    items: tuple[ParsedPlacemark, ...]
    global_warnings: tuple[str, ...]


def cache_preview(
    database_session: Session,
    map_id: UUID,
    user_id: UUID,
    file_name: str,
    payload: bytes,
    items: list[ParsedPlacemark],
    warnings: list[str],
) -> KmzPreviewRead:
    """Persist the validated archive so any worker can rebuild the preview."""

    IMPORT_ROOT.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid4()}.kmz"
    final_path = IMPORT_ROOT / storage_name
    temporary_path = IMPORT_ROOT / f".{storage_name}.tmp"
    temporary_path.write_bytes(payload)
    temporary_path.replace(final_path)
    now = datetime.now(UTC)
    preview = KmzImportPreview(
        map_id=map_id,
        user_id=user_id,
        storage_name=storage_name,
        file_name=file_name,
        created_at=now,
        expires_at=now + IMPORT_TTL,
    )
    database_session.add(preview)
    database_session.flush()
    cached = CachedKmzImport(
        import_id=preview.id,
        map_id=map_id,
        user_id=user_id,
        file_name=file_name,
        created_at=now,
        items=tuple(items),
        global_warnings=tuple(warnings),
    )
    return preview_to_read(cached)


def mark_duplicate_items(database_session: Session, map_id: UUID, items: list[ParsedPlacemark]) -> None:
    """Mark exact, map-local name/coordinate matches without changing data."""

    seen_in_file: set[tuple[str, float, float]] = set()
    for item in items:
        if item.name is None or item.latitude is None or item.longitude is None:
            continue
        signature = (item.name.strip().casefold(), item.latitude, item.longitude)
        if signature in seen_in_file:
            item.warnings.append("Potential duplicate within this KMZ file")
            item.duplicate_place_id = "within-import"
            item.duplicate_reason = "within_file"
            continue
        seen_in_file.add(signature)
        existing_id = _find_existing_duplicate(database_session, map_id, item)
        if existing_id is not None:
            item.duplicate_place_id = str(existing_id)
            item.duplicate_reason = "existing_map"
            item.warnings.append("Already imported or existing on this map; skipped by default")


def mark_outside_country_items(poi_map: PoiMap, items: list[ParsedPlacemark]) -> str | None:
    """Annotate out-of-country placemarks and report unavailable boundaries."""

    boundary_unavailable = False
    for item in items:
        if item.latitude is None or item.longitude is None:
            continue
        result = validate_point_country(
            item.latitude,
            item.longitude,
            poi_map.country.iso_alpha3,
        )
        if result.status == "boundary_unavailable":
            boundary_unavailable = True
        elif result.requires_confirmation:
            item.outside_map_country = True
            item.warnings.append(
                f"Ce point semble situé hors de {poi_map.country.name}; "
                "sélectionnez-le explicitement pour confirmer son import."
            )
    if boundary_unavailable:
        return (
            f"La frontière locale de {poi_map.country.name} n’est pas disponible ; "
            "la compatibilité géographique n’a pas pu être vérifiée."
        )
    return None


def get_cached_import(database_session: Session, import_id: UUID, map_id: UUID, user_id: UUID) -> CachedKmzImport:
    preview = database_session.get(KmzImportPreview, import_id)
    if preview is None or preview.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC):
        raise HTTPException(status_code=410, detail="The KMZ import preview has expired")
    if preview.map_id != map_id or preview.user_id != user_id:
        raise HTTPException(status_code=404, detail="The KMZ import preview does not belong to this map")
    archive_path = (IMPORT_ROOT / preview.storage_name).resolve()
    if archive_path.parent != IMPORT_ROOT or not archive_path.is_file():
        raise HTTPException(status_code=410, detail="The KMZ import preview is no longer available")
    try:
        validated = validate_kmz_upload(preview.file_name, archive_path.read_bytes())
        try:
            items, warnings = parse_kmz(validated.archive, tuple(entry.filename for entry in validated.entries))
        finally:
            validated.archive.close()
    except (KmzSecurityError, KmzParseError) as error:
        raise HTTPException(status_code=410, detail="The KMZ import preview is no longer valid") from error
    mark_duplicate_items(database_session, map_id, items)
    poi_map = database_session.get(PoiMap, map_id)
    if poi_map is None:
        raise HTTPException(status_code=404, detail="Map not found")
    boundary_warning = mark_outside_country_items(poi_map, items)
    if boundary_warning:
        warnings.append(boundary_warning)
    return CachedKmzImport(
        import_id=preview.id,
        map_id=preview.map_id,
        user_id=preview.user_id,
        file_name=preview.file_name,
        created_at=preview.created_at.replace(tzinfo=UTC),
        items=tuple(items),
        global_warnings=tuple(warnings),
    )


def remove_cached_import(database_session: Session, import_id: UUID) -> None:
    preview = database_session.get(KmzImportPreview, import_id)
    if preview is None:
        return
    (IMPORT_ROOT / preview.storage_name).unlink(missing_ok=True)
    database_session.delete(preview)


def preview_to_read(cached: CachedKmzImport) -> KmzPreviewRead:
    item_previews = [_item_preview(item) for item in cached.items]
    return KmzPreviewRead(
        import_id=cached.import_id,
        file_name=cached.file_name,
        placemark_count=len(cached.items),
        valid_count=sum(item.importable for item in item_previews),
        warning_count=sum(len(item.warnings) for item in item_previews) + len(cached.global_warnings),
        error_count=sum(len(item.errors) for item in item_previews),
        items=item_previews,
        global_warnings=list(cached.global_warnings),
    )


def confirm_import(
    database_session: Session,
    map_id: UUID,
    cached: CachedKmzImport,
    selected_indexes: list[int],
    *,
    download_remote_images: bool = False,
    force_indexes: list[int] | None = None,
    progress_callback: ProgressCallback | None = None,
) -> KmzImportReport:
    """Persist all selected valid points atomically and clean files on failure."""

    if database_session.get(PoiMap, map_id) is None:
        raise HTTPException(status_code=404, detail=f"Map with id {map_id} was not found")
    if len(selected_indexes) != len(set(selected_indexes)):
        raise HTTPException(status_code=422, detail="Each KMZ item may only be selected once")
    by_index = {item.source_index: item for item in cached.items}
    selected = [by_index[index] for index in selected_indexes if index in by_index]
    if len(selected) != len(selected_indexes):
        raise HTTPException(status_code=422, detail="Selected KMZ items do not belong to this preview")
    forced_indexes = set(force_indexes or [])
    if not forced_indexes.issubset(set(selected_indexes)):
        raise HTTPException(status_code=422, detail="Forced KMZ items must be selected for import")
    # A duplicate is intentionally not importable in the preview, but a stale or
    # hand-crafted confirmation must still be safe and report it as skipped.
    # Only malformed placemarks remain invalid requests.
    invalid = [
        item.source_index
        for item in selected
        if item.latitude is None or item.longitude is None or item.errors
    ]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Selected KMZ items are not importable: {invalid}")

    new_items = [
        item for item in selected
        if item.source_index in forced_indexes or (
            item.duplicate_place_id is None
            and _find_existing_duplicate(database_session, map_id, item) is None
        )
    ]
    quotas = QuotaService(database_session)
    owner_id = database_session.scalar(select(PoiMap.owner_id).where(PoiMap.id == map_id))
    if owner_id is None:
        raise HTTPException(status_code=404, detail="Map not found")
    quotas.ensure_can_create(cached.user_id, QuotaKey.PLACES_PER_MAP_MAX, scope_id=map_id, increment=len(new_items))
    if database_session.scalar(select(Category.id).where(Category.map_id == map_id, func.lower(Category.name) == "importé")) is None:
        quotas.ensure_can_create(cached.user_id, QuotaKey.CATEGORIES_PER_MAP_MAX, scope_id=map_id)
    if database_session.scalar(select(PlaceStatus.id).where(PlaceStatus.map_id == map_id, PlaceStatus.slug == "importe")) is None:
        quotas.ensure_can_create(cached.user_id, QuotaKey.STATUSES_PER_MAP_MAX, scope_id=map_id)
    image_increment = sum(
        sum(image.source_type == "embedded" or (download_remote_images and image.source_type == "remote_supported") for image in item.images)
        for item in new_items
    )
    if image_increment:
        quotas.ensure_can_create(owner_id, QuotaKey.PHOTOS_TOTAL_MAX, increment=image_increment)
    embedded_bytes = sum(image.size or 0 for item in new_items for image in item.images if image.source_type == "embedded")
    if embedded_bytes:
        quotas.ensure_can_create(owner_id, QuotaKey.STORAGE_BYTES_MAX, increment=embedded_bytes)

    stored_files: list[tuple[str, UUID, UUID]] = []
    created_ids: list[UUID] = []
    embedded_images_added = 0
    remote_images_added = 0
    remote_images_unavailable = 0
    skipped_count = 0
    import_warnings = list(cached.global_warnings)
    import_warnings.extend(
        f"{item.name or f'Point {item.source_index + 1}'} a été importé hors du pays de la carte."
        for item in selected
        if item.outside_map_country
    )
    image_assignments: list[tuple[Place, list[ParsedImage]]] = []
    image_total = sum(
        sum(
            image.source_type == "embedded"
            or (download_remote_images and image.source_type == "remote_supported")
            for image in item.images
        )
        for item in selected
    )
    progress_total = max(1, len(selected) + image_total)
    progress_completed = 0

    def report_progress(message: str, increment: int = 0) -> None:
        nonlocal progress_completed
        progress_completed = min(progress_total, progress_completed + increment)
        if progress_callback is not None:
            progress_callback(progress_completed, progress_total, message)

    report_progress("Préparation de l’import")
    try:
        category = _get_or_create_import_category(database_session, map_id)
        place_status = _get_or_create_import_status(database_session, map_id)
        for item in selected:
            duplicate_exists = (
                item.duplicate_place_id is not None
                or _find_existing_duplicate(database_session, map_id, item) is not None
            )
            if duplicate_exists and item.source_index not in forced_indexes:
                skipped_count += 1
                skipped_images = sum(
                    image.source_type == "embedded"
                    or (download_remote_images and image.source_type == "remote_supported")
                    for image in item.images
                )
                report_progress("POI déjà présent, ignoré", 1 + skipped_images)
                continue
            mapped_fields, custom_fields = _item_data(item)
            place = Place(
                name=mapped_fields.get("name", f"Point importé {item.source_index + 1}"),
                map_id=map_id,
                status_id=place_status.id,
                description=mapped_fields.get("description"),
                location=WKTElement(f"POINT({item.longitude} {item.latitude})", srid=4326),
                region=mapped_fields.get("region"),
                condition=mapped_fields.get("condition"),
                danger_level=mapped_fields.get("danger_level"),
                custom_fields=custom_fields,
            )
            database_session.add(place)
            database_session.flush()
            imported_links = _item_links(item)
            if imported_links:
                quotas.ensure_can_create(owner_id, QuotaKey.LINKS_PER_PLACE_MAX, scope_id=place.id, increment=len(imported_links))
                database_session.add_all(
                    PlaceLink(place_id=place.id, url=link.url, label=link.label, sort_order=sort_order)
                    for sort_order, link in enumerate(imported_links)
                )
            place_image_increment = sum(
                image.source_type == "embedded" or (download_remote_images and image.source_type == "remote_supported")
                for image in item.images
            )
            if place_image_increment:
                quotas.ensure_can_create(owner_id, QuotaKey.PHOTOS_PER_PLACE_MAX, scope_id=place.id, increment=place_image_increment)
            database_session.execute(place_categories_table.insert().values(place_id=place.id, category_id=category.id, is_primary=True))
            image_assignments.append((place, item.images))
            created_ids.append(place.id)
            report_progress(f"POI créé : {place.name}", 1)

        for place, images in image_assignments:
            for order, image in enumerate(images):
                if image.source_type != "embedded" or image.payload is None:
                    continue
                try:
                    _store_image(
                        database_session,
                        place,
                        image,
                        order,
                        stored_files,
                        cached.user_id,
                    )
                    embedded_images_added += 1
                    report_progress(f"Image intégrée ajoutée à {place.name}", 1)
                except (PhotoStorageError, OSError) as error:
                    import_warnings.append(f"Image ignorée pour {place.name}: {error}")
                    report_progress(f"Image ignorée pour {place.name}", 1)

        if download_remote_images:
            remote_assignments: dict[str, list[tuple[Place, ParsedImage, int]]] = {}
            for place, images in image_assignments:
                for order, image in enumerate(images):
                    if image.source_type == "remote_supported" and image.remote_url:
                        remote_assignments.setdefault(image.remote_url, []).append((place, image, order))

            remote_count = len(remote_assignments)
            for remote_index, (remote_url, assignments) in enumerate(remote_assignments.items(), start=1):
                report_progress(f"Téléchargement de l’image distante {remote_index}/{remote_count}")
                try:
                    downloaded = download_remote_image(remote_url)
                except RemoteImageError:
                    remote_images_unavailable += len(assignments)
                    import_warnings.append(
                        f"Une image distante utilisée par {len(assignments)} POI n’a pas pu être téléchargée"
                    )
                    report_progress("Image distante indisponible", len(assignments))
                    continue

                for place, image, order in assignments:
                    downloaded_image = ParsedImage(
                        internal_id=image.internal_id,
                        original_name=image.original_name,
                        mime_type=downloaded.mime_type,
                        size=len(downloaded.payload),
                        payload=downloaded.payload,
                        source_type="remote_supported",
                        host=image.host,
                    )
                    try:
                        _store_image(
                            database_session,
                            place,
                            downloaded_image,
                            order,
                            stored_files,
                            cached.user_id,
                        )
                        remote_images_added += 1
                        report_progress(f"Image distante ajoutée à {place.name}", 1)
                    except (PhotoStorageError, OSError) as error:
                        remote_images_unavailable += 1
                        import_warnings.append(f"Image distante ignorée pour {place.name}: {error}")
                        report_progress(f"Image distante ignorée pour {place.name}", 1)
        database_session.commit()
    except Exception as error:
        database_session.rollback()
        for relative_path, place_id, photo_id in reversed(stored_files):
            try:
                delete_photo_file(relative_path, place_id, photo_id)
            except PhotoStorageError:
                pass
        if isinstance(error, (SQLAlchemyError, PhotoStorageError, OSError, TypeError)):
            raise HTTPException(status_code=500, detail="Unable to confirm the KMZ import") from error
        raise

    report_progress("Import terminé", progress_total - progress_completed)
    return KmzImportReport(
        created_count=len(created_ids),
        skipped_count=skipped_count,
        error_count=0,
        images_added=len(stored_files),
        embedded_images_added=embedded_images_added,
        remote_images_added=remote_images_added,
        remote_images_unavailable=remote_images_unavailable,
        created_place_ids=created_ids,
        failures=[],
        warnings=import_warnings,
    )


def _store_image(
    database_session: Session,
    place: Place,
    image: ParsedImage,
    order: int,
    stored_files: list[tuple[str, UUID, UUID]],
    uploaded_by_user_id: UUID,
) -> None:
    if image.payload is None:
        return
    photo_id = uuid4()
    maximum, dimension = get_media_upload_policy(database_session, uploaded_by_user_id)
    stored = store_photo_file(
        BytesIO(image.payload),
        image.mime_type,
        place.id,
        photo_id,
        max_size_bytes=maximum * 1024 * 1024,
        max_dimension=dimension,
    )
    stored_files.append((stored.relative_path, place.id, photo_id))
    database_session.add(
        Photo(
            id=photo_id,
            place_id=place.id,
            filename=stored.filename,
            original_name=image.original_name,
            path=stored.relative_path,
            sort_order=order,
            is_primary=order == 0,
            mime_type=stored.media_type,
            file_size_bytes=stored.file_size_bytes,
            width=stored.width,
            height=stored.height,
            uploaded_by_user_id=uploaded_by_user_id,
        )
    )


def _get_or_create_import_category(database_session: Session, map_id: UUID) -> Category:
    database_session.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"cartavault:import-category:{map_id}"))))
    category = database_session.scalar(select(Category).where(Category.map_id == map_id, func.lower(Category.name) == "importé").with_for_update())
    if category is None:
        category = Category(map_id=map_id, name=IMPORTED_CATEGORY_NAME, description="POI importés depuis un fichier externe", icon=DEFAULT_CATEGORY_ICON_ID)
        database_session.add(category)
        database_session.flush()
    return category


def _get_or_create_import_status(database_session: Session, map_id: UUID) -> PlaceStatus:
    database_session.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"cartavault:import-status:{map_id}"))))
    place_status = database_session.scalar(
        select(PlaceStatus).where(PlaceStatus.map_id == map_id, PlaceStatus.slug == "importe").with_for_update()
    )
    if place_status is None:
        max_order = database_session.scalar(
            select(func.coalesce(func.max(PlaceStatus.sort_order), 0)).where(PlaceStatus.map_id == map_id)
        )
        place_status = PlaceStatus(map_id=map_id, name="Importé", slug=slugify_status_name("Importé"), color="#64707A", functional_state="non_visited", sort_order=max_order + 10, is_default=False, is_active=True)
        database_session.add(place_status)
        database_session.flush()
    return place_status


def _item_preview(item: ParsedPlacemark) -> KmzImportItemPreview:
    mapped_fields, custom_fields = _item_data(item)
    warnings = list(item.warnings)
    errors = list(item.errors)
    if item.name is None:
        warnings.append("Missing name; a deterministic import name will be used")
    already_imported = item.duplicate_place_id is not None
    importable = item.latitude is not None and item.longitude is not None and not errors and not already_imported
    return KmzImportItemPreview(
        source_index=item.source_index,
        selected_by_default=importable and not item.outside_map_country,
        name=mapped_fields.get("name"),
        latitude=item.latitude,
        longitude=item.longitude,
        altitude=item.altitude,
        mapped_fields=mapped_fields,
        custom_fields=custom_fields,
        images=[KmzImagePreview(internal_id=image.internal_id, original_name=image.original_name, mime_type=image.mime_type, size=image.size, source_type=image.source_type, host=image.host) for image in item.images],
        warnings=warnings,
        errors=errors,
        importable=importable,
        already_imported=already_imported,
        duplicate_reason=item.duplicate_reason,
        outside_map_country=item.outside_map_country,
    )


def _find_existing_duplicate(database_session: Session, map_id: UUID, item: ParsedPlacemark) -> UUID | None:
    if item.name is None or item.latitude is None or item.longitude is None:
        return None
    return database_session.scalar(
        select(Place.id).where(
            Place.map_id == map_id,
            func.lower(func.btrim(Place.name)) == item.name.strip().lower(),
            func.ST_Equals(
                Place.location,
                func.ST_SetSRID(func.ST_MakePoint(item.longitude, item.latitude), 4326),
            ),
        ).limit(1)
    )


def _item_data(item: ParsedPlacemark) -> tuple[dict[str, str], dict[str, str | list[str]]]:
    mapped_fields, custom_fields = map_extended_data(item.extended_data, name=item.name, description=item.description)
    return mapped_fields, custom_fields


def _item_links(item: ParsedPlacemark) -> list[PlaceLinkCreate]:
    """Read CartaVault link metadata without accepting arbitrary KML fields as URLs."""

    raw_value = next((value for key, value in item.extended_data if key == "cartavault:links"), None)
    if raw_value is None:
        return []
    try:
        payload = json.loads(raw_value)
    except (TypeError, ValueError):
        return []
    if not isinstance(payload, list):
        return []

    links: list[PlaceLinkCreate] = []
    urls: set[str] = set()
    for raw_link in payload[:20]:
        if not isinstance(raw_link, dict):
            continue
        try:
            link = PlaceLinkCreate.model_validate(
                {"url": raw_link.get("url"), "label": raw_link.get("label"), "sort_order": len(links)}
            )
        except ValueError:
            continue
        if link.url in urls:
            continue
        urls.add(link.url)
        links.append(link)
    return links
