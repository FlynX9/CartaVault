"""Opaque, short-lived provider sessions kept outside browser-visible state."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService


class ProviderSessionError(RuntimeError):
    pass


@dataclass(frozen=True)
class GoogleTilesSession:
    user_id: UUID
    credential_id: UUID
    provider_session: str
    expires_at: datetime
    capability: str = "satellite_basemap"


@dataclass(frozen=True)
class BasemapTileSession:
    """Encrypted, short-lived authorization for a raster tile provider.

    The provider secret stays opaque to the browser and tile requests can be
    served without checking out a PostgreSQL connection for every image.
    """

    provider: str
    user_id: UUID
    credential_id: UUID
    api_key: str
    capability: str
    expires_at: datetime


def encode_google_tiles_session(session: GoogleTilesSession) -> str:
    payload = json.dumps(
        {
            "kind": "google_tiles",
            "user_id": str(session.user_id),
            "credential_id": str(session.credential_id),
            "provider_session": session.provider_session,
            "expires_at": session.expires_at.astimezone(UTC).isoformat(),
            "capability": session.capability,
        },
        separators=(",", ":"),
    )
    return CredentialEncryptionService.from_settings().encrypt(payload).ciphertext


def decode_google_tiles_session(token: str) -> GoogleTilesSession:
    try:
        raw = CredentialEncryptionService.from_settings().decrypt(token, 1)
        payload = json.loads(raw)
        if payload.get("kind") != "google_tiles":
            raise ValueError("unexpected provider session kind")
        expires_at = datetime.fromisoformat(str(payload["expires_at"]).replace("Z", "+00:00"))
        result = GoogleTilesSession(
            user_id=UUID(str(payload["user_id"])),
            credential_id=UUID(str(payload["credential_id"])),
            provider_session=str(payload["provider_session"]),
            expires_at=expires_at,
            capability=str(payload.get("capability") or "satellite_basemap"),
        )
    except (CredentialEncryptionError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ProviderSessionError("Invalid provider session") from error
    if result.expires_at <= datetime.now(UTC):
        raise ProviderSessionError("Expired provider session")
    return result


def encode_basemap_tile_session(session: BasemapTileSession) -> str:
    payload = json.dumps(
        {
            "kind": "basemap_tiles",
            "provider": session.provider,
            "user_id": str(session.user_id),
            "credential_id": str(session.credential_id),
            "api_key": session.api_key,
            "capability": session.capability,
            "expires_at": session.expires_at.astimezone(UTC).isoformat(),
        },
        separators=(",", ":"),
    )
    return CredentialEncryptionService.from_settings().encrypt(payload).ciphertext


def decode_basemap_tile_session(token: str, *, provider: str) -> BasemapTileSession:
    try:
        raw = CredentialEncryptionService.from_settings().decrypt(token, 1)
        payload = json.loads(raw)
        if payload.get("kind") != "basemap_tiles" or payload.get("provider") != provider:
            raise ValueError("unexpected basemap session scope")
        expires_at = datetime.fromisoformat(str(payload["expires_at"]).replace("Z", "+00:00"))
        result = BasemapTileSession(
            provider=str(payload["provider"]),
            user_id=UUID(str(payload["user_id"])),
            credential_id=UUID(str(payload["credential_id"])),
            api_key=str(payload["api_key"]),
            capability=str(payload["capability"]),
            expires_at=expires_at,
        )
        if not result.api_key:
            raise ValueError("empty provider key")
    except (CredentialEncryptionError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ProviderSessionError("Invalid basemap session") from error
    if result.expires_at <= datetime.now(UTC):
        raise ProviderSessionError("Expired basemap session")
    return result
