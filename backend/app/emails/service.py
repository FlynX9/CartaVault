from __future__ import annotations

from string import Template
from pathlib import Path

from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import SystemCredential
from app.config import email_settings
from app.emails.providers.base import EmailDeliveryError, EmailMessage, EmailProvider
from app.emails.providers.resend import ResendEmailProvider


TEMPLATES = Path(__file__).parent / "templates"
SUPPORTED_LOCALES = {"fr", "en"}
SUBJECTS = {
    "fr": {
        "registration_admin": "Nouvelle demande d’inscription CartaVault",
        "registration_approved": "Votre accès CartaVault est approuvé",
        "password_reset": "Réinitialisez votre mot de passe CartaVault",
    },
    "en": {
        "registration_admin": "New CartaVault registration request",
        "registration_approved": "Your CartaVault access has been approved",
        "password_reset": "Reset your CartaVault password",
    },
}


def _render(name: str, values: dict[str, str]) -> str:
    return Template((TEMPLATES / name).read_text(encoding="utf-8")).safe_substitute(values)


def provider_from_database(session: Session) -> EmailProvider:
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        raise EmailDeliveryError("EMAIL_PROVIDER_NOT_CONFIGURED", "Le service d’email n’est pas configuré.")
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise EmailDeliveryError(error.code, "Le service d’email n’est pas disponible.") from error
    return ResendEmailProvider(api_key)


class EmailService:
    def __init__(self, provider: EmailProvider) -> None:
        self.provider = provider

    def _send(self, template: str, recipients: list[str], values: dict[str, str], locale: str = "fr") -> str | None:
        resolved_locale = locale if locale in SUPPORTED_LOCALES else "fr"
        common = {"app_url": email_settings.frontend_public_url, **values}
        return self.provider.send(EmailMessage(
            recipients,
            SUBJECTS[resolved_locale][template],
            _render(f"{template}.{resolved_locale}.html", common),
            _render(f"{template}.{resolved_locale}.txt", common),
        ))

    def notify_registration_admins(self, recipients: list[str], applicant_email: str, locale: str = "fr") -> str | None:
        return self._send("registration_admin", recipients, {"applicant_email": applicant_email}, locale)

    def notify_registration_approved(self, recipient: str, display_name: str, locale: str = "fr") -> str | None:
        return self._send("registration_approved", [recipient], {"display_name": display_name}, locale)

    def send_password_reset(self, recipient: str, display_name: str, token: str, locale: str = "fr") -> str | None:
        reset_url = f"{email_settings.frontend_public_url}/reset-password?token={token}"
        return self._send("password_reset", [recipient], {"display_name": display_name, "reset_url": reset_url, "ttl_minutes": str(email_settings.password_reset_token_ttl_minutes)}, locale)
