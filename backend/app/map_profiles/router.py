from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.map_profiles.catalog import public_profiles
from app.map_profiles.schemas import StarterProfileRead


router = APIRouter(prefix="/map-profiles", tags=["map-profiles"])


@router.get("", response_model=list[StarterProfileRead])
def get_map_profiles(current_user: User = Depends(get_current_user)) -> list[StarterProfileRead]:
    locale = str((getattr(current_user, "preferences", {}) or {}).get("language") or "fr")
    return public_profiles(locale)
