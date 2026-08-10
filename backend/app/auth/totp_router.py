from __future__ import annotations

import base64
from datetime import timedelta
from io import BytesIO

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_session
from app.auth.models import TotpRecoveryCode, UserSession
from app.auth.rate_limit import public_auth_rate_limiter, rate_limit_key
from app.auth.registration_security import record_auth_event
from app.auth.schemas import TotpConfirmRequest, TotpRecoveryCodesRead, TotpSecurityStatus, TotpSensitiveAction, TotpSetupRead
from app.auth.security import verify_password
from app.auth.sessions import revoke_user_sessions
from app.config import security_settings
from app.auth.totp import clear_totp, consume_recovery_code, enroll_secret, generate_secret, now_utc, provisioning_uri, regenerate_recovery_codes, verify_code
from app.database import get_db

router = APIRouter(prefix="/account/security/totp", tags=["account"])


def _status(session: Session, current: UserSession) -> TotpSecurityStatus:
    remaining = session.scalar(select(func.count()).select_from(TotpRecoveryCode).where(TotpRecoveryCode.user_id == current.user_id, TotpRecoveryCode.used_at.is_(None))) or 0
    return TotpSecurityStatus(enabled=current.user.totp_enabled, verified_at=current.user.totp_verified_at, recovery_codes_remaining=remaining)


def _require_factor(session: Session, current: UserSession, payload: TotpSensitiveAction) -> None:
    if not verify_password(current.user.password_hash, payload.current_password)[0]:
        raise HTTPException(400, "Current password is incorrect")
    if not (verify_code(current.user, payload.code) or consume_recovery_code(session, current.user, payload.code)):
        raise HTTPException(400, "Invalid authentication code")


@router.get("", response_model=TotpSecurityStatus)
def status(database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> TotpSecurityStatus:
    return _status(database_session, current)


@router.post("/setup", response_model=TotpSetupRead, responses={200: {"headers": {"Cache-Control": {"schema": {"type": "string"}}}}})
def setup(response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> TotpSetupRead:
    public_auth_rate_limiter.check(rate_limit_key("totp-setup", str(current.user_id)))
    if current.user.totp_enabled:
        raise HTTPException(409, "Two-factor authentication is already enabled")
    secret = generate_secret()
    enroll_secret(current.user, secret)
    uri = provisioning_uri(secret, current.user.email)
    image = qrcode.make(uri)
    buffer = BytesIO(); image.save(buffer, format="PNG")
    database_session.commit()
    record_auth_event(database_session, "totp_enrollment_started", "accepted", actor_user_id=current.user_id)
    database_session.commit()
    response.headers["Cache-Control"] = "no-store, private"
    return TotpSetupRead(secret=secret, provisioning_uri=uri, qr_code_data_url="data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"), expires_at=current.user.totp_enrollment_expires_at, account=current.user.email)


@router.post("/confirm", response_model=TotpRecoveryCodesRead)
def confirm(payload: TotpConfirmRequest, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> TotpRecoveryCodesRead:
    public_auth_rate_limiter.check(rate_limit_key("totp-enroll-confirm", str(current.user_id)))
    if current.user.totp_enabled or current.user.totp_enrollment_expires_at is None or current.user.totp_enrollment_expires_at < now_utc() or not verify_code(current.user, payload.code):
        record_auth_event(database_session, "totp_enabled", "failed", actor_user_id=current.user_id)
        database_session.commit()
        raise HTTPException(400, "Invalid or expired authentication code")
    current.user.totp_enabled = True
    current.user.totp_verified_at = now_utc()
    current.user.totp_enrollment_expires_at = None
    recovery_codes = regenerate_recovery_codes(database_session, current.user)
    record_auth_event(database_session, "totp_enabled", "accepted", actor_user_id=current.user_id)
    database_session.commit()
    response.headers["Cache-Control"] = "no-store, private"
    return TotpRecoveryCodesRead(recovery_codes=recovery_codes)


@router.post("/recovery-codes/regenerate", response_model=TotpRecoveryCodesRead)
def regenerate(payload: TotpSensitiveAction, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> TotpRecoveryCodesRead:
    public_auth_rate_limiter.check(rate_limit_key("totp-recovery-regenerate", str(current.user_id)))
    if not current.user.totp_enabled:
        raise HTTPException(409, "Two-factor authentication is not enabled")
    _require_factor(database_session, current, payload)
    values = regenerate_recovery_codes(database_session, current.user)
    record_auth_event(database_session, "recovery_codes_regenerated", "accepted", actor_user_id=current.user_id)
    database_session.commit(); response.headers["Cache-Control"] = "no-store, private"
    return TotpRecoveryCodesRead(recovery_codes=values)


@router.post("/disable", status_code=204)
def disable(payload: TotpSensitiveAction, response: Response, database_session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> Response:
    public_auth_rate_limiter.check(rate_limit_key("totp-disable", str(current.user_id)))
    if not current.user.totp_enabled:
        raise HTTPException(409, "Two-factor authentication is not enabled")
    _require_factor(database_session, current, payload)
    clear_totp(database_session, current.user)
    revoke_user_sessions(database_session, current.user_id)
    record_auth_event(database_session, "totp_disabled", "accepted", actor_user_id=current.user_id)
    database_session.commit()
    response.delete_cookie(security_settings.session_cookie_name, path="/")
    response.delete_cookie(security_settings.csrf_cookie_name, path="/")
    response.status_code = 204
    return response
