from __future__ import annotations

from pathlib import Path
from html import escape
import re
from string import Template

from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import SystemCredential
from app.admin.models import SystemSetting
from app.config import email_settings, security_settings
from app.emails.providers.base import EmailDeliveryError, EmailMessage, EmailProvider
from app.emails.providers.resend import ResendEmailProvider
from app.emails.providers.smtp import SMTPEmailProvider


TEMPLATES = Path(__file__).parent / "templates"
SUPPORTED_LOCALES = {"fr", "en"}
SUBJECTS = {
    "fr": {
        "registration_admin": "Nouvelle demande d’inscription CartaVault",
        "registration_verification": "Confirmez votre adresse email CartaVault",
        "registration_approved": "Votre accès CartaVault est approuvé",
        "password_reset": "Réinitialisez votre mot de passe CartaVault",
        "password_changed": "Votre mot de passe CartaVault a été modifié",
        "email_changed": "Votre adresse email CartaVault a été modifiée",
        "map_share": "Une carte CartaVault vous a été partagée",
        "map_share_registration": "Une carte CartaVault vous attend",
        "map_ownership": "Validez le transfert d’une carte CartaVault",
        "map_ownership_registration": "Une carte CartaVault vous est proposée",
        "resend_verification": "Votre configuration email CartaVault fonctionne",
        "email_mfa_code": "Votre code de sécurité CartaVault",
        "contact_message": "Nouveau message CartaVault — $kind",
    },
    "en": {
        "registration_admin": "New CartaVault registration request",
        "registration_verification": "Confirm your CartaVault email address",
        "registration_approved": "Your CartaVault access has been approved",
        "password_reset": "Reset your CartaVault password",
        "password_changed": "Your CartaVault password was changed",
        "email_changed": "Your CartaVault email address was changed",
        "map_share": "A CartaVault map has been shared with you",
        "map_share_registration": "A CartaVault map has been shared with you",
        "map_ownership": "Approve a CartaVault map ownership transfer",
        "map_ownership_registration": "A CartaVault map is waiting for you",
        "resend_verification": "Your CartaVault email configuration works",
        "email_mfa_code": "Your CartaVault security code",
        "contact_message": "New CartaVault message — $kind",
    },
}


def _render(name: str, values: dict[str, str]) -> str:
    return Template((TEMPLATES / name).read_text(encoding="utf-8")).safe_substitute(values)


def _email_content(rendered: str) -> str:
    """Keep repository templates as message fragments while retiring legacy shells."""
    legacy = re.search(r'<td style="padding:30px">(.*)</td></tr></table></td></tr></table></body>', rendered, flags=re.DOTALL)
    content = legacy.group(1) if legacy else rendered
    return re.sub(r'<p[^>]*>Carta<span[^>]*>Vault</span></p>', '', content, count=1)


def _email_shell(content: str, locale: str, app_url: str) -> str:
    language = "fr" if locale == "fr" else "en"
    footer = "Vous recevez cet e-mail car une action a été effectuée dans CartaVault." if language == "fr" else "You received this email because an action was performed in CartaVault."
    logo_url = escape(f"{app_url.rstrip('/')}/cartavault-logo.png", quote=True)
    return f'''<!doctype html>
<html lang="{language}"><body style="margin:0;padding:0;background:#edf3f5;color:#102234;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#edf3f5"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce8ea;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(13,27,42,.08)">
      <tr><td style="padding:20px 28px;background:linear-gradient(135deg,#073a43,#0fa68a);color:#ffffff">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:42px;padding-right:12px"><img src="{logo_url}" width="42" height="42" alt="CartaVault" style="display:block;border:0;border-radius:11px;background:#ffffff" /></td><td><strong style="font-size:21px;letter-spacing:-.4px">Carta<span style="color:#bff8e9">Vault</span></strong><br><span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#d7fff6">Espace cartographique</span></td></tr></table>
      </td></tr>
      <tr><td style="padding:30px 32px 26px;font-size:15px;line-height:1.6;color:#304456">
        {content}
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f4f8f8;border-top:1px solid #e2ecec;color:#6b7b88;font-size:12px;line-height:1.45">{footer}</td></tr>
    </table>
  </td></tr></table>
</body></html>'''


def provider_from_database(
    session: Session,
    *,
    allow_disabled: bool = False,
    provider: str | None = None,
) -> EmailProvider:
    selected_provider = provider or email_settings.provider
    if selected_provider == "none" and not allow_disabled:
        raise EmailDeliveryError("EMAIL_DELIVERY_DISABLED", "L’envoi d’emails est désactivé.")
    configured = session.get(SystemSetting, "email")
    values = configured.value if configured is not None else {}
    sender = {
        "from_name": str(values.get("sender_name") or email_settings.from_name),
        "from_address": str(values.get("sender_address") or email_settings.from_address),
        "reply_to": str(values.get("reply_to_address") or email_settings.reply_to or ""),
    }
    if selected_provider == "smtp":
        return SMTPEmailProvider(**sender)
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        raise EmailDeliveryError("EMAIL_PROVIDER_NOT_CONFIGURED", "Le service d’email n’est pas configuré.")
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise EmailDeliveryError(error.code, "Le service d’email n’est pas disponible.") from error
    return ResendEmailProvider(
        api_key,
        **sender,
    )


class EmailService:
    def __init__(self, provider: EmailProvider) -> None:
        self.provider = provider

    def _send(self, template: str, recipients: list[str], values: dict[str, str], locale: str = "fr") -> str | None:
        resolved_locale = locale if locale in SUPPORTED_LOCALES else "fr"
        common = {"app_url": email_settings.frontend_public_url, **values}
        escaped_common = {key: escape(value, quote=True) for key, value in common.items()}
        return self.provider.send(EmailMessage(
            recipients,
            Template(SUBJECTS[resolved_locale][template]).safe_substitute(common),
            _email_shell(_email_content(_render(f"{template}.{resolved_locale}.html", escaped_common)), resolved_locale, common["app_url"]),
            _render(f"{template}.{resolved_locale}.txt", common),
        ))

    def notify_registration_admins(self, recipients: list[str], applicant_email: str, locale: str = "fr") -> str | None:
        return self._send("registration_admin", recipients, {"applicant_email": applicant_email}, locale)

    def send_registration_verification(self, recipient: str, display_name: str, token: str, locale: str = "fr") -> str | None:
        verification_url = f"{email_settings.frontend_public_url}/verify-email?token={token}"
        return self._send(
            "registration_verification",
            [recipient],
            {
                "display_name": display_name,
                "verification_url": verification_url,
                "ttl_hours": str(security_settings.registration_verification_hours),
            },
            locale,
        )

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

    def send_email_mfa_code(self, recipient: str, display_name: str, code: str, locale: str = "fr") -> str | None:
        return self._send("email_mfa_code", [recipient], {"display_name": display_name, "code": code, "ttl_minutes": "10"}, locale)

    def send_contact_message(self, sender_email: str, sender_name: str, kind: str, message: str, locale: str = "fr") -> str | None:
        labels = {
            "fr": {"incident": "Incident", "suggestion": "Suggestion"},
            "en": {"incident": "Incident", "suggestion": "Suggestion"},
        }
        resolved_locale = locale if locale in SUPPORTED_LOCALES else "fr"
        return self._send(
            "contact_message",
            ["contact@cartavault.fr"],
            {
                "sender_email": sender_email,
                "sender_name": sender_name,
                "kind": labels[resolved_locale].get(kind, kind),
                "message": message,
            },
            resolved_locale,
        )
