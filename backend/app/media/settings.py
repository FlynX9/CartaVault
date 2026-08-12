from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.quotas.service import QuotaService

DEFAULT_MAX_UPLOAD_MEGABYTES = 5
MIN_MAX_UPLOAD_MEGABYTES = 1
MAX_MAX_UPLOAD_MEGABYTES = 100
DEFAULT_MAX_IMAGE_DIMENSION = 2560
MIN_MAX_IMAGE_DIMENSION = 1024
MAX_MAX_IMAGE_DIMENSION = 7680


def get_max_upload_megabytes(session: Session) -> int:
    setting = session.get(SystemSetting, "media_upload")
    value = (setting.value or {}).get("max_upload_megabytes") if setting else None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_MAX_UPLOAD_MEGABYTES
    return min(MAX_MAX_UPLOAD_MEGABYTES, max(MIN_MAX_UPLOAD_MEGABYTES, parsed))


def get_max_image_dimension(session: Session) -> int:
    setting = session.get(SystemSetting, "media_upload")
    value = (setting.value or {}).get("max_image_dimension") if setting else None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_MAX_IMAGE_DIMENSION
    return min(MAX_MAX_IMAGE_DIMENSION, max(MIN_MAX_IMAGE_DIMENSION, parsed))


def get_media_upload_policy(session: Session, user_id) -> tuple[int, int]:
    """Return a profile override or, when absent, the instance defaults."""
    profile = QuotaService(session).effective_profile(user_id)
    return (
        get_max_upload_megabytes(session) if profile.image_upload_megabytes_max is None else profile.image_upload_megabytes_max,
        get_max_image_dimension(session) if profile.image_dimension_max is None else profile.image_dimension_max,
    )


def set_media_upload_settings(
    session: Session,
    *,
    max_upload_megabytes: int,
    max_image_dimension: int,
) -> tuple[int, int]:
    normalized_upload = min(MAX_MAX_UPLOAD_MEGABYTES, max(MIN_MAX_UPLOAD_MEGABYTES, int(max_upload_megabytes)))
    normalized_dimension = min(MAX_MAX_IMAGE_DIMENSION, max(MIN_MAX_IMAGE_DIMENSION, int(max_image_dimension)))
    setting = session.get(SystemSetting, "media_upload")
    if setting is None:
        setting = SystemSetting(
            key="media_upload",
            value={
                "max_upload_megabytes": normalized_upload,
                "max_image_dimension": normalized_dimension,
            },
        )
        session.add(setting)
    else:
        setting.value = {
            **(setting.value or {}),
            "max_upload_megabytes": normalized_upload,
            "max_image_dimension": normalized_dimension,
        }
    session.commit()
    return normalized_upload, normalized_dimension
