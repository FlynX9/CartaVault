from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import email_settings
from app.emails.providers.base import EmailDeliveryError, EmailMessage
from app.emails.providers.retry import deliver_with_retry


class ResendEmailProvider:
    def __init__(
        self,
        api_key: str,
        *,
        from_name: str | None = None,
        from_address: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        self.api_key = api_key
        self.from_name = from_name if from_name is not None else email_settings.from_name
        self.from_address = from_address if from_address is not None else email_settings.from_address
        self.reply_to = reply_to if reply_to is not None else email_settings.reply_to

    def _send_once(self, message: EmailMessage) -> str | None:
        if not self.from_address:
            raise EmailDeliveryError(
                "EMAIL_SENDER_NOT_CONFIGURED",
                "L’adresse d’expédition Resend n’est pas configurée.",
            )
        payload = {
            "from": f"{self.from_name} <{self.from_address}>",
            "to": message.recipients,
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }
        if self.reply_to:
            payload["reply_to"] = self.reply_to
        request = Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "CartaVault/1.0",
            },
        )
        try:
            with urlopen(request, timeout=email_settings.timeout_seconds) as response:  # noqa: S310 - fixed Resend endpoint
                result: object = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            transient = error.code == 429 or error.code >= 500
            code = "EMAIL_PROVIDER_RATE_LIMITED" if error.code == 429 else (
                "EMAIL_PROVIDER_UNAVAILABLE" if transient else "EMAIL_PROVIDER_REJECTED"
            )
            raise EmailDeliveryError(code, retryable=transient) from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", retryable=True) from error
        return result.get("id") if isinstance(result, dict) and isinstance(result.get("id"), str) else None

    def send(self, message: EmailMessage) -> str | None:
        return deliver_with_retry(
            lambda: self._send_once(message),
            max_attempts=email_settings.max_attempts,
            delay_seconds=email_settings.retry_delay_seconds,
        )
