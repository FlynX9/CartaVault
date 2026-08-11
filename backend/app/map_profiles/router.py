from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.database import get_db
from app.map_profiles.catalog import public_profiles
from app.map_profiles.schemas import (
    StarterProfileId,
    StarterProfileImport,
    StarterProfileImportResult,
    StarterProfileRead,
)
from app.map_profiles.service import import_profile_resources
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


router = APIRouter(prefix="/map-profiles", tags=["map-profiles"])


@router.get("", response_model=list[StarterProfileRead])
def get_map_profiles(current_user: User = Depends(get_current_user)) -> list[StarterProfileRead]:
    locale = str((getattr(current_user, "preferences", {}) or {}).get("language") or "fr")
    return public_profiles(locale)


@router.post("/{profile_id}/import", response_model=StarterProfileImportResult)
def import_map_profile_resources(
    profile_id: StarterProfileId,
    data: StarterProfileImport,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StarterProfileImportResult:
    require_map_role(database_session, data.map_id, current_user, "editor")
    locale = str((getattr(current_user, "preferences", {}) or {}).get("language") or "fr")
    created, skipped = import_profile_resources(
        database_session, data.map_id, profile_id, data.resource_type, locale,
    )
    quota_key = {
        "categories": QuotaKey.CATEGORIES_PER_MAP_MAX,
        "tags": QuotaKey.TAGS_PER_MAP_MAX,
        "statuses": QuotaKey.STATUSES_PER_MAP_MAX,
    }[data.resource_type]
    try:
        if created:
            with database_session.no_autoflush:
                QuotaService(database_session).ensure_can_create(
                    current_user.id, quota_key, scope_id=data.map_id, increment=created,
                )
        database_session.commit()
    except IntegrityError:
        database_session.rollback()
        # A concurrent import may have inserted one of the same names.
        created, skipped = import_profile_resources(
            database_session, data.map_id, profile_id, data.resource_type, locale,
        )
        if created:
            with database_session.no_autoflush:
                QuotaService(database_session).ensure_can_create(
                    current_user.id, quota_key, scope_id=data.map_id, increment=created,
                )
        database_session.commit()
    return StarterProfileImportResult(created=created, skipped=skipped)
