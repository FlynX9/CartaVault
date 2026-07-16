from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.auth.models import User, UserSession
from app.auth.schemas import PasswordReset, UserAdminCreate, UserAdminUpdate, UserRead
from app.auth.security import hash_password, normalize_email
from app.database import get_db

router = APIRouter(prefix="/admin/users", tags=["admin-users"], dependencies=[Depends(require_admin)])


def _read(user: User) -> UserRead:
    return UserRead.model_validate(user, from_attributes=True)


def _active_admin_count(database_session: Session) -> int:
    return database_session.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True), User.is_active.is_(True))) or 0


@router.get("", response_model=list[UserRead])
def list_users(q: str | None = Query(default=None, max_length=320), database_session: Session = Depends(get_db)) -> list[UserRead]:
    statement = select(User)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(User.email.ilike(pattern) | User.display_name.ilike(pattern))
    return [_read(user) for user in database_session.scalars(statement.order_by(func.lower(User.email), User.id))]


@router.post("", response_model=UserRead, status_code=201)
def create_user(data: UserAdminCreate, database_session: Session = Depends(get_db)) -> UserRead:
    user = User(
        email=normalize_email(str(data.email)), display_name=data.display_name.strip(),
        password_hash=hash_password(data.password), is_admin=data.is_admin, is_active=data.is_active,
    )
    try:
        database_session.add(user)
        database_session.commit()
        database_session.refresh(user)
        return _read(user)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A user with this email already exists") from error


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: UUID, database_session: Session = Depends(get_db)) -> UserRead:
    user = database_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _read(user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: UUID, data: UserAdminUpdate, database_session: Session = Depends(get_db)) -> UserRead:
    user = database_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    supplied = data.model_dump(exclude_unset=True)
    removes_last_admin = user.is_admin and user.is_active and (
        supplied.get("is_admin") is False or supplied.get("is_active") is False
    )
    if removes_last_admin and _active_admin_count(database_session) <= 1:
        raise HTTPException(status_code=409, detail="The last active administrator cannot be disabled or demoted")
    if "display_name" in supplied:
        supplied["display_name"] = supplied["display_name"].strip()
    for key, value in supplied.items():
        setattr(user, key, value)
    if supplied.get("is_active") is False:
        database_session.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=func.now()))
    try:
        database_session.commit()
        database_session.refresh(user)
        return _read(user)
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update user") from error


@router.post("/{user_id}/reset-password", status_code=204)
def reset_password(user_id: UUID, data: PasswordReset, database_session: Session = Depends(get_db)):
    user = database_session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(data.new_password)
    database_session.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=func.now()))
    database_session.commit()
    return None
