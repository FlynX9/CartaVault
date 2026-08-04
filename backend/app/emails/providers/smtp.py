from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage as MimeEmailMessage
from email.utils import formataddr, formatdate, make_msgid

from app.config import email_settings
from app.emails.providers.base import EmailDeliveryError, EmailMessage
from app.emails.providers.retry import deliver_with_retry


class SMTPEmailProvider:
    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        security: str | None = None,
        username: str | None = None,
        password: str | None = None,
        from_name: str | None = None,
        from_address: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        self.host = host if host is not None else email_settings.smtp_host
        self.port = port if port is not None else email_settings.smtp_port
        self.security = security if security is not None else email_settings.smtp_security
        self.username = username if username is not None else email_settings.smtp_username
        self.password = password if password is not None else email_settings.smtp_password
        self.from_name = from_name if from_name is not None else email_settings.from_name
        self.from_address = from_address if from_address is not None else email_settings.from_address
        self.reply_to = reply_to if reply_to is not None else email_settings.reply_to

    def _mime_message(self, message: EmailMessage) -> MimeEmailMessage:
        if not self.host:
            raise EmailDeliveryError("EMAIL_PROVIDER_NOT_CONFIGURED", "Le serveur SMTP n’est pas configuré.")
        if not self.from_address:
            raise EmailDeliveryError("EMAIL_SENDER_NOT_CONFIGURED", "L’adresse d’expédition SMTP n’est pas configurée.")
        if not message.recipients:
            raise EmailDeliveryError("EMAIL_RECIPIENT_NOT_CONFIGURED")
        mime = MimeEmailMessage()
        mime["From"] = formataddr((self.from_name, self.from_address))
        mime["To"] = ", ".join(message.recipients)
        mime["Subject"] = message.subject
        mime["Date"] = formatdate(localtime=False)
        mime["Message-ID"] = make_msgid(domain=self.from_address.partition("@")[2] or None)
        if self.reply_to:
            mime["Reply-To"] = self.reply_to
        mime.set_content(message.text)
        mime.add_alternative(message.html, subtype="html")
        return mime

    def _send_once(self, message: EmailMessage) -> str | None:
        mime = self._mime_message(message)
        context = ssl.create_default_context()
        try:
            if self.security == "tls":
                client_context = smtplib.SMTP_SSL(
                    self.host,
                    self.port,
                    timeout=email_settings.timeout_seconds,
                    context=context,
                )
            else:
                client_context = smtplib.SMTP(
                    self.host,
                    self.port,
                    timeout=email_settings.timeout_seconds,
                )
            with client_context as client:
                if self.security == "starttls":
                    client.ehlo()
                    client.starttls(context=context)
                    client.ehlo()
                if self.username:
                    client.login(self.username, self.password)
                refused = client.send_message(mime)
                if refused:
                    raise EmailDeliveryError("EMAIL_PROVIDER_REJECTED")
                return mime.get("Message-ID")
        except EmailDeliveryError:
            raise
        except smtplib.SMTPNotSupportedError as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_TLS_UNAVAILABLE") from error
        except smtplib.SMTPAuthenticationError as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_AUTHENTICATION_FAILED") from error
        except (smtplib.SMTPSenderRefused, smtplib.SMTPRecipientsRefused) as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_REJECTED") from error
        except smtplib.SMTPResponseException as error:
            transient = 400 <= error.smtp_code < 500
            raise EmailDeliveryError(
                "EMAIL_PROVIDER_UNAVAILABLE" if transient else "EMAIL_PROVIDER_REJECTED",
                retryable=transient,
            ) from error
        except ssl.SSLCertVerificationError as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_TLS_FAILED") from error
        except (smtplib.SMTPException, OSError, TimeoutError) as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", retryable=True) from error

    def send(self, message: EmailMessage) -> str | None:
        return deliver_with_retry(
            lambda: self._send_once(message),
            max_attempts=email_settings.max_attempts,
            delay_seconds=email_settings.retry_delay_seconds,
        )
