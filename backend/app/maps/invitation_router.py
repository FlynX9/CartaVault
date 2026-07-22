from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.dependencies import get_current_session, get_current_user
from app.auth.models import User, UserSession
from app.auth.router import _self_read, _set_session_cookies
from app.auth.schemas import UserSelfRead
from app.auth.security import generate_token, hash_password, hash_token, normalize_email
from app.config import security_settings
from app.database import get_db
from app.maps.models import MapInvitation, MapMembership
from app.quotas.service import QuotaService
from app.quotas.registry import QuotaKey
from app.maps.schemas import InvitationAccept, InvitationPublicRead, PendingInvitationRead

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _pending_invitation_for_user(
    database_session: Session,
    invitation_id: UUID,
    user: User,
) -> MapInvitation:
    now = datetime.now(UTC).replace(tzinfo=None)
    invitation = database_session.scalar(
        select(MapInvitation)
        .options(joinedload(MapInvitation.map), joinedload(MapInvitation.created_by))
        .where(
            MapInvitation.id == invitation_id,
            MapInvitation.email == normalize_email(user.email),
            MapInvitation.accepted_at.is_(None),
            MapInvitation.revoked_at.is_(None),
            MapInvitation.expires_at > now,
        )
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Pending invitation not found")
    return invitation


def _accept_for_user(database_session: Session, invitation: MapInvitation, user: User) -> None:
    membership = database_session.scalar(
        select(MapMembership).where(
            MapMembership.map_id == invitation.map_id,
            MapMembership.user_id == user.id,
        )
    )
    if membership is None:
        QuotaService(database_session).ensure_can_create(user.id, QuotaKey.MEMBERS_PER_MAP_MAX, scope_id=invitation.map_id)
        QuotaService(database_session).ensure_can_create(user.id, QuotaKey.MEMBERSHIPS_TOTAL_MAX)
        database_session.add(MapMembership(map_id=invitation.map_id, user_id=user.id, role=invitation.role))
    elif membership.role != "owner":
        membership.role = invitation.role
    invitation.accepted_at = datetime.now(UTC).replace(tzinfo=None)


@router.get("/pending", response_model=list[PendingInvitationRead])
def list_pending_invitations(
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PendingInvitationRead]:
    now = datetime.now(UTC).replace(tzinfo=None)
    invitations = database_session.scalars(
        select(MapInvitation)
        .options(joinedload(MapInvitation.map), joinedload(MapInvitation.created_by))
        .where(
            MapInvitation.email == normalize_email(current_user.email),
            MapInvitation.accepted_at.is_(None),
            MapInvitation.revoked_at.is_(None),
            MapInvitation.expires_at > now,
        )
        .order_by(MapInvitation.created_at, MapInvitation.id)
    ).all()
    return [
        PendingInvitationRead(
            id=invitation.id,
            map_id=invitation.map_id,
            map_name=invitation.map.name,
            role=invitation.role,
            invited_by_display_name=invitation.created_by.display_name,
            created_at=invitation.created_at,
            expires_at=invitation.expires_at,
        )
        for invitation in invitations
    ]


@router.post("/pending/{invitation_id}/accept", status_code=204)
def accept_pending_invitation(
    invitation_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    invitation = _pending_invitation_for_user(database_session, invitation_id, current_user)
    _accept_for_user(database_session, invitation, current_user)
    database_session.commit()
    return Response(status_code=204)


@router.post("/pending/{invitation_id}/decline", status_code=204)
def decline_pending_invitation(
    invitation_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    invitation = _pending_invitation_for_user(database_session, invitation_id, current_user)
    invitation.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()
    return Response(status_code=204)


def _invitation(database_session: Session, token: str) -> MapInvitation:
    invitation = database_session.scalar(
        select(MapInvitation).options(joinedload(MapInvitation.map)).where(MapInvitation.token_hash == hash_token(token))
    )
    now = datetime.now(UTC).replace(tzinfo=None)
    if invitation is None or invitation.revoked_at is not None or invitation.accepted_at is not None or invitation.expires_at <= now:
        raise HTTPException(status_code=404, detail="Invitation not found, expired or already used")
    return invitation


@router.get("/{token}", response_model=InvitationPublicRead)
def inspect_invitation(token: str, database_session: Session = Depends(get_db)) -> InvitationPublicRead:
    invitation = _invitation(database_session, token)
    account = database_session.scalar(select(User.id).where(User.email == invitation.email))
    return InvitationPublicRead(map_name=invitation.map.name, email=invitation.email, role=invitation.role, expires_at=invitation.expires_at, requires_account=account is None)


@router.post("/{token}/accept", response_model=UserSelfRead)
def accept_invitation(token: str, data: InvitationAccept, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead:
    invitation = _invitation(database_session, token)
    session_cookie = request.cookies.get(security_settings.session_cookie_name)
    authenticated_session = None
    if session_cookie:
        authenticated_session = database_session.scalar(
            select(UserSession).options(joinedload(UserSession.user)).where(
                UserSession.token_hash == hash_token(session_cookie), UserSession.revoked_at.is_(None),
                UserSession.expires_at > datetime.now(UTC).replace(tzinfo=None),
            )
        )
    existing_user = database_session.scalar(select(User).where(User.email == invitation.email))
    if authenticated_session is not None and authenticated_session.user.email != invitation.email:
        raise HTTPException(status_code=403, detail="This invitation belongs to another email address")
    user = authenticated_session.user if authenticated_session else existing_user
    if user is None:
        if not data.display_name or not data.password:
            raise HTTPException(status_code=422, detail="Display name and password are required to create the invited account")
        user = User(
            email=normalize_email(invitation.email), display_name=data.display_name.strip(),
            password_hash=hash_password(data.password), is_admin=False, is_active=True,
            quota_profile_id=QuotaService(database_session).default_profile().id,
        )
        database_session.add(user)
        database_session.flush()
    elif authenticated_session is None:
        raise HTTPException(status_code=401, detail="Sign in with the invited email before accepting")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    _accept_for_user(database_session, invitation, user)
    csrf_token = request.cookies.get(security_settings.csrf_cookie_name)
    if authenticated_session is None:
        raw_session, csrf_token = generate_token(), generate_token()
        now = datetime.now(UTC).replace(tzinfo=None)
        database_session.add(UserSession(
            user_id=user.id, token_hash=hash_token(raw_session), csrf_token_hash=hash_token(csrf_token),
            expires_at=now + timedelta(days=security_settings.session_days), last_used_at=now,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        ))
        _set_session_cookies(response, raw_session, csrf_token, security_settings.session_days * 86400)
    database_session.commit()
    assert csrf_token is not None
    return _self_read(user, csrf_token)
