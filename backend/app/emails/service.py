from __future__ import annotations

from pathlib import Path
from html import escape
from string import Template

from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import SystemCredential
from app.admin.models import SystemSetting
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
        "password_changed": "Votre mot de passe CartaVault a été modifié",
        "email_changed": "Votre adresse email CartaVault a été modifiée",
        "map_share": "Une carte CartaVault vous a été partagée",
        "map_share_registration": "Une carte CartaVault vous attend",
        "map_ownership": "Validez le transfert d’une carte CartaVault",
        "map_ownership_registration": "Une carte CartaVault vous est proposée",
        "resend_verification": "Votre configuration email CartaVault fonctionne",
    },
    "en": {
        "registration_admin": "New CartaVault registration request",
        "registration_approved": "Your CartaVault access has been approved",
        "password_reset": "Reset your CartaVault password",
        "password_changed": "Your CartaVault password was changed",
        "email_changed": "Your CartaVault email address was changed",
        "map_share": "A CartaVault map has been shared with you",
        "map_share_registration": "A CartaVault map has been shared with you",
        "map_ownership": "Approve a CartaVault map ownership transfer",
        "map_ownership_registration": "A CartaVault map is waiting for you",
        "resend_verification": "Your CartaVault email configuration works",
    },
}


def _render(name: str, values: dict[str, str]) -> str:
    return Template((TEMPLATES / name).read_text(encoding="utf-8")).safe_substitute(values)


def provider_from_database(session: Session) -> EmailProvider:
    if email_settings.provider == "none":
        raise EmailDeliveryError("EMAIL_DELIVERY_DISABLED", "L’envoi d’emails est désactivé.")
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        raise EmailDeliveryError("EMAIL_PROVIDER_NOT_CONFIGURED", "Le service d’email n’est pas configuré.")
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise EmailDeliveryError(error.code, "Le service d’email n’est pas disponible.") from error
    configured = session.get(SystemSetting, "email")
    values = configured.value if configured is not None else {}
    return ResendEmailProvider(
        api_key,
        from_name=str(values.get("sender_name") or email_settings.from_name),
        from_address=str(values.get("sender_address") or email_settings.from_address),
        reply_to=str(values.get("reply_to_address") or email_settings.reply_to or ""),
    )


class EmailService:
    def __init__(self, provider: EmailProvider) -> None:
        self.provider = provider

    def _send(self, template: str, recipients: list[str], values: dict[str, str], locale: str = "fr") -> str | None:
        resolved_locale = locale if locale in SUPPORTED_LOCALES else "fr"
        common = {"app_url": email_settings.frontend_public_url, **values}
        return self.provider.send(EmailMessage(
            recipients,
            SUBJECTS[resolved_locale][template],
            _render(f"{template}.{resolved_locale}.html", {key: escape(value, quote=True) for key, value in common.items()}),
            _render(f"{template}.{resolved_locale}.txt", common),
        ))

    def notify_registration_admins(self, recipients: list[str], applicant_email: str, locale: str = "fr") -> str | None:
        return self._send("registration_admin", recipients, {"applicant_email": applicant_email}, locale)

    def notify_registration_approved(self, recipient: str, display_name: str, locale: str = "fr") -> str | None:
        return self._send("registration_approved", [recipient], {"display_name": display_name}, locale)

    def send_password_reset(self, recipient: str, display_name: str, token: str, locale: str = "fr") -> str | None:
        reset_url = f"{email_settings.frontend_public_url}/reset-password?token={token}"
        return self._send("password_reset", [recipient], {"display_name": display_name, "reset_url": reset_url, "ttl_minutes": str(email_settings.password_reset_token_ttl_minutes)}, locale)

    def send_map_share_invitation(
        self,
        recipient: str,
        inviter_email: str,
        map_name: str,
        token: str,
        requires_account: bool,
        locale: str = "fr",
    ) -> str | None:
        invitation_url = f"{email_settings.frontend_public_url}/invitations/{token}"
        return self._send(
            "map_share_registration" if requires_account else "map_share",
            [recipient],
            {
                "inviter_email": inviter_email,
                "map_name": map_name,
                "invitation_url": invitation_url,
            },
            locale,
        )

    def notify_password_changed(self, recipient: str, display_name: str, locale: str = "fr") -> str | None:
        return self._send("password_changed", [recipient], {"display_name": display_name}, locale)

    def send_map_ownership_invitation(
        self,
        recipient: str,
        owner_email: str,
        map_name: str,
        token: str,
        requires_account: bool,
        locale: str = "fr",
    ) -> str | None:
        invitation_url = f"{email_settings.frontend_public_url}/invitations/{token}"
        return self._send(
            "map_ownership_registration" if requires_account else "map_ownership",
            [recipient],
            {"owner_email": owner_email, "map_name": map_name, "invitation_url": invitation_url},
            locale,
        )

    def notify_email_changed(
        self,
        recipient: str,
        display_name: str,
        old_email: str,
        new_email: str,
        locale: str = "fr",
    ) -> str | None:
        return self._send(
            "email_changed",
            [recipient],
            {"display_name": display_name, "old_email": old_email, "new_email": new_email},
            locale,
        )

    def send_resend_verification(
        self,
        recipient: str,
        display_name: str,
        locale: str = "fr",
    ) -> str | None:
        return self._send(
            "resend_verification",
            [recipient],
            {"display_name": display_name},
            locale,
        )
