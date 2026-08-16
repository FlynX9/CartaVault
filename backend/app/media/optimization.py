from __future__ import annotations

from pathlib import PurePosixPath

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.photos.models import Photo
from app.photos.storage import PhotoFileNotFoundError, PhotoStorageError, delete_photo_file, delete_photo_thumbnail, persist_materialized_photo, resolve_photo_file
from app.media.settings import get_max_image_dimension
from app.tasks.models import BackgroundTask
from app.tasks.registry import ProgressCallback, task_handler

MEDIA_OPTIMIZATION_TASK = "media_optimization"
@task_handler(MEDIA_OPTIMIZATION_TASK)
def optimize_existing_media(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict:
    photos = session.scalars(select(Photo).where(Photo.path.is_not(None)).order_by(Photo.created_at, Photo.id)).all()
    max_dimension = get_max_image_dimension(session)
    total = max(1, len(photos))
    optimized = skipped = failed = saved_bytes = 0
    for index, photo in enumerate(photos, start=1):
        progress(index - 1, total, f"Optimisation de {index}/{len(photos)}")
        if photo.storage_scope_id is None or photo.path is None:
            skipped += 1
            continue
        try:
            source = resolve_photo_file(photo.path, photo.storage_scope_id, photo.id, require_file=True)
            before_size = source.stat().st_size
            target = source.with_suffix(".webp")
            temporary = target.with_suffix(".partial")
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image)
                image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                image.save(temporary, format="WEBP", quality=84, method=6)
                width, height = image.size
            temporary.replace(target)
            if target != source:
                old_path = photo.path
                new_path = PurePosixPath(str(photo.storage_scope_id), target.name).as_posix()
                persist_materialized_photo(new_path, target, "image/webp")
                delete_photo_file(old_path, photo.storage_scope_id, photo.id)
            else:
                new_path = photo.path
                persist_materialized_photo(new_path, target, "image/webp")
            photo.path = new_path
            photo.filename = target.name
            photo.mime_type = "image/webp"
            photo.file_size_bytes = target.stat().st_size
            photo.width, photo.height = width, height
            delete_photo_thumbnail(photo.id)
            optimized += 1
            saved_bytes += max(0, before_size - photo.file_size_bytes)
        except (PhotoFileNotFoundError, UnidentifiedImageError, PhotoStorageError, OSError, ValueError):
            failed += 1
            # Most failures happen while reading or transforming a file.  Do not
            # roll back the whole task here: that would discard metadata updates
            # for every photo processed since the preceding progress commit.
        if index % 10 == 0:
            session.commit()
    session.commit()
    progress(total, total, "Optimisation terminée")
    return {"total": len(photos), "optimized": optimized, "skipped": skipped, "failed": failed, "saved_bytes": saved_bytes}
