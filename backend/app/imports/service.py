"""Preview cache and transactional persistence for KMZ imports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
import json
import logging
import os
from pathlib import Path
from typing import Callable
from uuid import UUID, uuid4

from fastapi import HTTPException
from geoalchemy2.elements import WKTElement
from sqlalchemy import Float, Integer, String, column, delete, func, insert, select, values
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
from app.photos.models import Photo, StorageOperation
from app.photos.reconciliation import (
    canonical_media_object_key,
    expedite_storage_write_cleanup,
    prepare_storage_write_cleanup,
)
from app.photos.storage import PhotoTooLargeError, UnsupportedPhotoTypeError, delete_photo_file, store_photo_file
from app.imports.remote_images import RemoteImageError, download_remote_image
from app.places.models import Place, PlaceLink
from app.places.schemas import PlaceLinkCreate
from app.statuses.models import PlaceStatus
from app.statuses.router import slugify_status_name
from app.quotas.registry import QuotaKey
from app.quotas.models import QuotaProfile
from app.quotas.service import QuotaService
from app.tasks.models import KmzImportPreview
from app.tasks.registry import register_rollback_cleanup


IMPORT_TTL = timedelta(minutes=15)
DUPLICATE_LOOKUP_BATCH_SIZE = 250
ProgressCallback = Callable[[int, int, str], None]
DEFAULT_IMPORT_ROOT = Path(__file__).resolve().parents[2] / "storage" / "imports"
IMPORT_ROOT = Path(os.getenv("IMPORT_STORAGE_PATH", str(DEFAULT_IMPORT_ROOT))).expanduser().resolve()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CachedKmzImport:
    import_id: UUID
    map_id: UUID
    user_id: UUID
    file_name: str
    created_at: datetime
    items: tuple[ParsedPlacemark, ...]
    global_warnings: tuple[str, ...]


@dataclass
class _ImportQuotaSnapshot:
    owner_id: UUID
    profile: QuotaProfile
    storage_usage: int
    maximum_upload_megabytes: int
    maximum_image_dimension: int
    storage_write_intent_ids: list[UUID]
    photo_rows: list[dict[str, object]]


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
    try:
        temporary_path.write_bytes(payload)
        temporary_path.replace(final_path)
    except OSError:
        temporary_path.unlink(missing_ok=True)
        raise
    register_rollback_cleanup(database_session, lambda: final_path.unlink(missing_ok=True))
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
    database_candidates: list[ParsedPlacemark] = []
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
        database_candidates.append(item)

    candidates_by_source = {item.source_index: item for item in database_candidates}
    for source_index, existing_id in _find_existing_duplicates(
        database_session, map_id, database_candidates
    ).items():
        source = candidates_by_source[source_index]
        source.duplicate_place_id = str(existing_id)
        source.duplicate_reason = "existing_map"
        source.warnings.append("Already imported or existing on this map; skipped by default")


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


def remove_cached_import(database_session: Session, import_id: UUID) -> Path | None:
    """Delete the preview row in-transaction and return its auxiliary file."""

    preview = database_session.get(KmzImportPreview, import_id)
    if preview is None:
        return None
    archive_path = IMPORT_ROOT / preview.storage_name
    database_session.delete(preview)
    return archive_path


def cleanup_cached_import_file(archive_path: Path | None) -> None:
    if archive_path is None:
        return
    try:
        archive_path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Unable to remove consumed KMZ preview path=%s", archive_path, exc_info=True)


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
    authorization_callback: Callable[[], None] | None = None,
) -> KmzImportReport:
    """Persist all selected valid points atomically and clean files on failure."""
    from app.tasks.fault_injection import crash_point

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

    existing_duplicates = _find_existing_duplicates(
        database_session,
        map_id,
        [item for item in selected if item.duplicate_place_id is None],
    )
    new_items = [
        item
        for item in selected
        if item.source_index in forced_indexes
        or (
            item.duplicate_place_id is None
            and item.source_index not in existing_duplicates
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
    quota_profile = quotas.effective_profile(owner_id)
    maximum_upload_megabytes, maximum_image_dimension = get_media_upload_policy(
        database_session, owner_id
    )
    quota_snapshot = _ImportQuotaSnapshot(
        owner_id=owner_id,
        profile=quota_profile,
        storage_usage=quotas.storage_usage(owner_id),
        maximum_upload_megabytes=maximum_upload_megabytes,
        maximum_image_dimension=maximum_image_dimension,
        storage_write_intent_ids=[],
        photo_rows=[],
    )
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
    category = _get_or_create_import_category(database_session, map_id)
    place_status = _get_or_create_import_status(database_session, map_id)
    place_rows: list[dict[str, object]] = []
    link_rows: list[dict[str, object]] = []
    category_assignments: list[dict[str, UUID | bool]] = []
    for item in selected:
        duplicate_exists = (
            item.duplicate_place_id is not None
            or item.source_index in existing_duplicates
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
            id=uuid4(),
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
        item_links = _item_links(item)
        if item_links:
            QuotaService._ensure_limit(
                QuotaKey.LINKS_PER_PLACE_MAX,
                quota_snapshot.profile,
                0,
                quota_snapshot.profile.links_per_place_max,
                len(item_links),
            )
            link_rows.extend(
                {
                    "place_id": place.id,
                    "url": link.url,
                    "label": link.label,
                    "sort_order": sort_order,
                }
                for sort_order, link in enumerate(item_links)
            )
        place_image_increment = sum(
            image.source_type == "embedded" or (download_remote_images and image.source_type == "remote_supported")
            for image in item.images
        )
        if place_image_increment:
            QuotaService._ensure_limit(
                QuotaKey.PHOTOS_PER_PLACE_MAX,
                quota_snapshot.profile,
                0,
                quota_snapshot.profile.photos_per_place_max,
                place_image_increment,
            )
        place_rows.append(
            {
                "id": place.id,
                "name": place.name,
                "map_id": place.map_id,
                "status_id": place.status_id,
                "description": place.description,
                "location": place.location,
                "region": place.region,
                "condition": place.condition,
                "danger_level": place.danger_level,
                "custom_fields": place.custom_fields,
            }
        )
        category_assignments.append(
            {"place_id": place.id, "category_id": category.id, "is_primary": True}
        )
        image_assignments.append((place, item.images))
        created_ids.append(place.id)
        report_progress(f"POI créé : {place.name}", 1)
        crash_point("kmz_after_place")

    # The import has no model lifecycle hooks. SQLAlchemy Core preserves column
    # types, defaults, constraints, and transaction ordering while avoiding one
    # ORM INSERT round-trip per independent imported row.
    if place_rows:
        database_session.execute(insert(Place), place_rows)
    if link_rows:
        database_session.execute(insert(PlaceLink), link_rows)
    if category_assignments:
        database_session.execute(place_categories_table.insert(), category_assignments)

    for place, images in image_assignments:
        for order, image in enumerate(images):
            if image.source_type != "embedded" or image.payload is None:
                continue
            _store_image(
                database_session,
                place,
                image,
                order,
                stored_files,
                quota_snapshot,
                cached.user_id,
            )
            embedded_images_added += 1
            report_progress(f"Image intégrée ajoutée à {place.name}", 1)

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

            for assignment_index, (place, image, order) in enumerate(assignments):
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
                        quota_snapshot,
                        cached.user_id,
                    )
                except (UnsupportedPhotoTypeError, PhotoTooLargeError):
                    remaining = len(assignments) - assignment_index
                    remote_images_unavailable += remaining
                    import_warnings.append(
                        f"Une image distante utilisée par {remaining} POI n’a pas pu être validée"
                    )
                    report_progress("Image distante invalide", remaining)
                    break
                remote_images_added += 1
                report_progress(f"Image distante ajoutée à {place.name}", 1)
    if quota_snapshot.photo_rows:
        database_session.execute(insert(Photo), quota_snapshot.photo_rows)
    if quota_snapshot.storage_write_intent_ids:
        database_session.execute(
            delete(StorageOperation).where(
                StorageOperation.id.in_(quota_snapshot.storage_write_intent_ids)
            )
        )
    report_progress("Import terminé", progress_total - progress_completed)

    # Preview authorization is intentionally not a durable permission grant.
    # The caller supplies the existing map policy check so it can reload the
    # requester and membership in the same session immediately before the
    # surrounding route/task transaction commits.  If it fails, the caller's
    # rollback path also runs the registered storage compensation callbacks.
    if authorization_callback is not None:
        authorization_callback()

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
    quota_snapshot: _ImportQuotaSnapshot,
    uploaded_by_user_id: UUID,
) -> None:
    if image.payload is None:
        return
    photo_id = uuid4()
    try:
        object_key = canonical_media_object_key(place.id, photo_id, image.mime_type)
    except ValueError as error:
        raise UnsupportedPhotoTypeError("Only JPEG, PNG and WebP images are supported") from error
    write_intent_id = prepare_storage_write_cleanup(
        database_session,
        namespace="media",
        object_key=object_key,
    )
    try:
        stored = store_photo_file(
            BytesIO(image.payload),
            image.mime_type,
            place.id,
            photo_id,
            max_size_bytes=quota_snapshot.maximum_upload_megabytes * 1024 * 1024,
            max_dimension=quota_snapshot.maximum_image_dimension,
        )
    except Exception:
        expedite_storage_write_cleanup(database_session, write_intent_id)
        raise
    stored_files.append((stored.relative_path, place.id, photo_id))
    register_rollback_cleanup(
        database_session,
        lambda: delete_photo_file(stored.relative_path, place.id, photo_id),
    )
    QuotaService._ensure_limit(
        QuotaKey.STORAGE_BYTES_MAX,
        quota_snapshot.profile,
        quota_snapshot.storage_usage,
        quota_snapshot.profile.storage_bytes_max,
        stored.file_size_bytes,
    )
    quota_snapshot.storage_usage += stored.file_size_bytes
    quota_snapshot.photo_rows.append(
        {
            "id": photo_id,
            "place_id": place.id,
            "map_id": place.map_id,
            "storage_scope_id": place.id,
            "filename": stored.filename,
            "original_name": image.original_name,
            "path": stored.relative_path,
            "sort_order": order,
            "is_primary": order == 0,
            "mime_type": stored.media_type,
            "file_size_bytes": stored.file_size_bytes,
            "width": stored.width,
            "height": stored.height,
            "storage_state": "available",
            "uploaded_by_user_id": uploaded_by_user_id,
        }
    )
    quota_snapshot.storage_write_intent_ids.append(write_intent_id)


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


def _find_existing_duplicates(
    database_session: Session,
    map_id: UUID,
    items: list[ParsedPlacemark],
) -> dict[int, UUID]:
    """Find exact map-local duplicates in bounded candidate batches.

    The SQL predicate deliberately mirrors ``_find_existing_duplicate``.  The
    source index keeps the result stable even when names or coordinates repeat.
    """

    candidates = [
        (item.source_index, item.name.strip().lower(), item.longitude, item.latitude)
        for item in items
        if item.name is not None and item.latitude is not None and item.longitude is not None
    ]
    duplicates: dict[int, UUID] = {}
    for offset in range(0, len(candidates), DUPLICATE_LOOKUP_BATCH_SIZE):
        batch = candidates[offset : offset + DUPLICATE_LOOKUP_BATCH_SIZE]
        candidate_values = values(
            column("source_index", Integer),
            column("normalized_name", String),
            column("longitude", Float),
            column("latitude", Float),
            name="kmz_duplicate_candidates",
        ).data(batch).alias()
        rows = database_session.execute(
            select(candidate_values.c.source_index, Place.id).join(
                Place,
                (Place.map_id == map_id)
                & (func.lower(func.btrim(Place.name)) == candidate_values.c.normalized_name)
                & func.ST_Equals(
                    Place.location,
                    func.ST_SetSRID(
                        func.ST_MakePoint(
                            candidate_values.c.longitude,
                            candidate_values.c.latitude,
                        ),
                        4326,
                    ),
                ),
            )
        ).all()
        for source_index, place_id in rows:
            duplicates[int(source_index)] = place_id
    return duplicates


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
