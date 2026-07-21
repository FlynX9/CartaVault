from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.maps.models import MapInvitation, MapMembership, PoiMap
    from app.trips.models import Trip


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="users_email_key"),
        Index("ix_users_email", "email", unique=True),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    avatar_filename: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    preferences: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sessions: Mapped[list["UserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_credentials: Mapped[list["UserApiCredential"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned_maps: Mapped[list["PoiMap"]] = relationship(back_populates="owner", foreign_keys="PoiMap.owner_id")
    memberships: Mapped[list["MapMembership"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    created_invitations: Mapped[list["MapInvitation"]] = relationship(back_populates="created_by", foreign_keys="MapInvitation.created_by_user_id")
    created_trips: Mapped[list["Trip"]] = relationship(back_populates="created_by")


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("user_sessions_token_hash_key", "token_hash", unique=True),
        Index("user_sessions_user_id_idx", "user_id"),
        Index("user_sessions_expires_at_idx", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    csrf_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class UserApiCredential(Base):
    __tablename__ = "user_api_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="user_api_credentials_user_provider_key"),
        CheckConstraint("provider IN ('google_routes')", name="user_api_credentials_provider_check"),
        CheckConstraint("encryption_version > 0", name="user_api_credentials_encryption_version_check"),
        Index("user_api_credentials_user_id_idx", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    encrypted_secret: Mapped[str] = mapped_column(Text, nullable=False)
    encryption_version: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    secret_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped[User] = relationship(back_populates="api_credentials")


class RegistrationRequest(Base):
    __tablename__ = "registration_requests"
    __table_args__ = (
        UniqueConstraint("email", name="registration_requests_email_key"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="registration_requests_status_check"),
        Index("registration_requests_status_created_idx", "status", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'pending'"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notification_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AuthActionToken(Base):
    __tablename__ = "auth_action_tokens"
    __table_args__ = (
        CheckConstraint("token_type IN ('password_reset')", name="auth_action_tokens_type_check"),
        Index("auth_action_tokens_token_hash_key", "token_hash", unique=True),
        Index("auth_action_tokens_user_type_idx", "user_id", "token_type"),
        Index("auth_action_tokens_expires_at_idx", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_type: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SystemCredential(Base):
    __tablename__ = "system_credentials"
    __table_args__ = (
        CheckConstraint("provider IN ('resend')", name="system_credentials_provider_check"),
        CheckConstraint("encryption_version > 0", name="system_credentials_encryption_version_check"),
    )

    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    encrypted_secret: Mapped[str] = mapped_column(Text, nullable=False)
    encryption_version: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    secret_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
