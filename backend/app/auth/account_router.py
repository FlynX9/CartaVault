from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.api_keys import selected_api_key, selected_basemap_api_key
from app.auth.avatar_storage import AvatarError, delete_avatar, resolve_avatar, store_avatar
from app.auth.dependencies import get_current_session
from app.auth.models import User, UserApiCredential, UserSession
from app.auth.schemas import AccountDelete, AccountPasswordChange, AccountPreferences, AccountProfileUpdate, EmailChange
from app.auth.security import hash_password, normalize_email, verify_password
from app.auth.sessions import issue_session, revoke_user_sessions
from app.auth.totp import clear_totp
from app.config import openroute_service_settings, security_settings
from app.database import get_db
from app.exports.temporary_exports import remove_for_user
from app.emails.notifications import notify_email_changed, notify_password_changed
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.basemaps.stadia_router import stadia_unauthenticated_allowed

router = APIRouter(prefix="/account", tags=["account"])

DEFAULT_PREFERENCES = AccountPreferences().model_dump()


def _set_session_cookies(response: Response, token: str, csrf_token: str) -> None:
    max_age = security_settings.session_days * 86400
    response.set_cookie(
        security_settings.session_cookie_name, token, max_age=max_age,
        httponly=True, secure=security_settings.cookie_secure, samesite="lax", path="/",
    )
    response.set_cookie(
        security_settings.csrf_cookie_name, csrf_token, max_age=max_age,
        httponly=False, secure=security_settings.cookie_secure, samesite="lax", path="/",
    )


def _rotate_session(database_session: Session, current: UserSession) -> tuple[str, str]:
    revoke_user_sessions(database_session, current.user_id)
    return issue_session(database_session, current.user_id, user_agent=current.user_agent)


def _profile(user: User, database_session: Session) -> dict:
    owned = database_session.scalars(
        select(PoiMap).where(PoiMap.owner_id == user.id, PoiMap.deleted_at.is_(None)).order_by(PoiMap.name)
    ).all()
    owned_map_count = database_session.scalar(
        select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == user.id)
    ) or 0
    shared_count = database_session.scalar(select(func.count()).select_from(MapMembership).where(MapMembership.user_id == user.id, MapMembership.role != "owner")) or 0
    active_sessions = database_session.scalar(select(func.count()).select_from(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(UTC).replace(tzinfo=None))) or 0
    return {"id": user.id, "email": user.email, "email_verified": True, "display_name": user.display_name, "is_admin": user.is_admin, "is_active": user.is_active, "created_at": user.created_at, "updated_at": user.updated_at, "last_login_at": user.last_login_at, "avatar_url": f"/account/avatar?v={user.avatar_updated_at.isoformat()}" if user.avatar_filename else None, "owned_maps": [{"id": item.id, "name": item.name} for item in owned], "shared_map_count": shared_count, "active_session_count": active_sessions, "can_delete": owned_map_count == 0}


def _preferences(user: User) -> dict[str, object]:
    # Normalize the one former flat routing key while retaining all other
    # persisted settings.  No database migration is needed for JSONB data.
    stored = user.preferences or {}
    return AccountPreferences.model_validate({**DEFAULT_PREFERENCES, **stored}).model_dump()


@router.get("/profile")
def profile(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    return _profile(current.user, database_session)


@router.patch("/profile")
def update_profile(data: AccountProfileUpdate, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    current.user.display_name = data.display_name
    database_session.commit()
    return _profile(current.user, database_session)


@router.get("/preferences")
def preferences(current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    return _preferences(current.user)


@router.put("/preferences")
def update_preferences(data: AccountPreferences, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    next_preferences = data.model_dump(mode="json")
    previous_preferences = current.user.preferences
    # Consent has its own dedicated endpoint and must not disappear when the
    # user later saves ordinary interface preferences.
    if isinstance(previous_preferences, dict) and "privacy_consent" in previous_preferences:
        next_preferences["privacy_consent"] = previous_preferences["privacy_consent"]
    current.user.preferences = next_preferences
    if data.routing.provider == "google" and selected_api_key(database_session, current.user, "routing", "google") is None:
        current.user.preferences = previous_preferences
        raise HTTPException(409, {"code": "ROUTING_CREDENTIAL_REQUIRED", "message": "Sélectionnez une clé Google pour le routage."})
    if data.routing.provider == "openrouteservice" and not openroute_service_settings.allow_unauthenticated and selected_api_key(database_session, current.user, "routing", "openrouteservice") is None:
        current.user.preferences = previous_preferences
        raise HTTPException(409, {"code": "ROUTING_CREDENTIAL_REQUIRED", "message": "Sélectionnez une clé OpenRouteService pour le routage."})
    if data.places.provider == "google" and selected_api_key(database_session, current.user, "places", "google") is None:
        current.user.preferences = previous_preferences
        raise HTTPException(409, {"code": "GOOGLE_PLACES_CREDENTIAL_REQUIRED", "message": "Sélectionnez une clé Google pour la recherche de lieux."})
    configured_basemap_providers = {
        provider for provider in (data.basemaps.classic_provider, data.basemaps.satellite_provider)
        if provider in {"stadia", "google", "mapbox"}
    }
    for basemap_provider in configured_basemap_providers:
        if basemap_provider == "stadia" and stadia_unauthenticated_allowed():
            continue
        if selected_basemap_api_key(database_session, current.user, basemap_provider) is None:
            current.user.preferences = previous_preferences
            raise HTTPException(409, {"code": "BASEMAP_CREDENTIAL_REQUIRED", "message": f"Sélectionnez une clé {basemap_provider.title()} pour la cartographie configurée."})
    database_session.commit()
    return _preferences(current.user)

@router.post("/preferences/reset")
def reset_preferences(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    consent = (current.user.preferences or {}).get("privacy_consent")
    current.user.preferences = {
        **DEFAULT_PREFERENCES,
        **({"privacy_consent": consent} if isinstance(consent, dict) else {}),
    }
    database_session.commit()
    return _preferences(current.user)


@router.post("/change-email")
def change_email(data: EmailChange, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    if not verify_password(current.user.password_hash, data.current_password)[0]:
        raise HTTPException(400, "Unable to change email with the supplied credentials")
    old_email = current.user.email
    current.user.email = normalize_email(data.new_email)
    raw_token, csrf_token = _rotate_session(database_session, current)
    try: database_session.commit()
    except IntegrityError as error:
        database_session.rollback(); raise HTTPException(409, "Unable to use this email address") from error
    _set_session_cookies(response, raw_token, csrf_token)
    notify_email_changed(database_session, current.user, old_email)
    return _profile(current.user, database_session)


@router.post("/change-password", status_code=204)
def account_password(data: AccountPasswordChange, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    if not verify_password(current.user.password_hash, data.current_password)[0]: raise HTTPException(400, "Current password is incorrect")
    current.user.password_hash = hash_password(data.new_password)
    raw_token, csrf_token = _rotate_session(database_session, current)
    database_session.commit()
    _set_session_cookies(response, raw_token, csrf_token)
    notify_password_changed(database_session, current.user)
    response.status_code = 204
    return response


@router.get("/sessions")
def sessions(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> list[dict]:
    rows = database_session.scalars(select(UserSession).where(UserSession.user_id == current.user_id, UserSession.revoked_at.is_(None), UserSession.expires_at > datetime.now(UTC).replace(tzinfo=None)).order_by(UserSession.last_used_at.desc())).all()
    return [{"id": row.id, "created_at": row.created_at, "last_used_at": row.last_used_at, "expires_at": row.expires_at, "user_agent": row.user_agent, "is_current": row.id == current.id} for row in rows]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: UUID, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    target = database_session.scalar(select(UserSession).where(UserSession.id == session_id, UserSession.user_id == current.user_id, UserSession.revoked_at.is_(None)))
    if target is None: raise HTTPException(404, "Session not found")
    target.revoked_at = datetime.now(UTC).replace(tzinfo=None); database_session.commit()
    if target.id == current.id:
        response.delete_cookie(security_settings.session_cookie_name, path="/"); response.delete_cookie(security_settings.csrf_cookie_name, path="/")
    response.status_code = 204; return response


@router.post("/sessions/revoke-others", status_code=204)
def revoke_others(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    database_session.execute(update(UserSession).where(UserSession.user_id == current.user_id, UserSession.id != current.id, UserSession.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC).replace(tzinfo=None))); database_session.commit(); return Response(status_code=204)


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    content = await file.read(5 * 1024 * 1024 + 1); old = current.user.avatar_filename
    try: filename = store_avatar(content)
    except AvatarError as error: raise HTTPException(422, str(error)) from error
    current.user.avatar_filename = filename; current.user.avatar_updated_at = datetime.now(UTC).replace(tzinfo=None)
    try: database_session.commit()
    except Exception: delete_avatar(filename); database_session.rollback(); raise
    delete_avatar(old); return {"avatar_url": f"/account/avatar?v={current.user.avatar_updated_at.isoformat()}"}


@router.get("/avatar")
def avatar(current: UserSession = Depends(get_current_session)) -> FileResponse:
    if not current.user.avatar_filename: raise HTTPException(404, "Avatar not found")
    path = resolve_avatar(current.user.avatar_filename)
    if not path.is_file(): raise HTTPException(404, "Avatar not found")
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/avatar", status_code=204)
def remove_avatar(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    old = current.user.avatar_filename; current.user.avatar_filename = None; current.user.avatar_updated_at = datetime.now(UTC).replace(tzinfo=None); database_session.commit(); delete_avatar(old); return Response(status_code=204)


@router.delete("")
def delete_account(data: AccountDelete, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    user = current.user
    if not verify_password(user.password_hash, data.current_password)[0]: raise HTTPException(400, "Unable to delete account")
    if database_session.scalar(select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == user.id)): raise HTTPException(409, "Transfer or delete owned maps first")
    if user.is_admin and (database_session.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True), User.is_active.is_(True))) or 0) <= 1: raise HTTPException(409, "The last active administrator cannot be deleted")
    now = datetime.now(UTC).replace(tzinfo=None); old_avatar = user.avatar_filename
    clear_totp(database_session, user)
    database_session.execute(update(UserSession).where(UserSession.user_id == user.id).values(revoked_at=now))
    database_session.execute(delete(MapMembership).where(MapMembership.user_id == user.id))
    database_session.execute(delete(UserApiCredential).where(UserApiCredential.user_id == user.id))
    database_session.execute(update(MapInvitation).where(MapInvitation.email == user.email, MapInvitation.accepted_at.is_(None)).values(revoked_at=now))
    user.display_name = "Utilisateur supprimé"; user.email = f"deleted-{user.id}@invalid.local"; user.is_active = False; user.is_admin = False; user.deleted_at = now; user.avatar_filename = None; user.avatar_updated_at = now
    database_session.commit(); delete_avatar(old_avatar); remove_for_user(user.id, database_session)
    response.delete_cookie(security_settings.session_cookie_name, path="/"); response.delete_cookie(security_settings.csrf_cookie_name, path="/"); response.status_code = 204; return response
