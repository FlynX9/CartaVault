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
