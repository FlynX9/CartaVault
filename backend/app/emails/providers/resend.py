from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import email_settings
from app.emails.providers.base import EmailDeliveryError, EmailMessage


class ResendEmailProvider:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def send(self, message: EmailMessage) -> str | None:
        payload = {
            "from": f"{email_settings.from_name} <{email_settings.from_address}>",
            "to": message.recipients,
            "reply_to": email_settings.reply_to,
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }
        request = Request(
            "https://api.resend.com/emails", data=json.dumps(payload).encode("utf-8"), method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "User-Agent": "CartaVault/1.0"},
        )
        try:
            with urlopen(request, timeout=email_settings.timeout_seconds) as response:  # noqa: S310 - fixed Resend endpoint
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            code = "EMAIL_PROVIDER_RATE_LIMITED" if error.code == 429 else "EMAIL_PROVIDER_REJECTED"
            raise EmailDeliveryError(code) from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE") from error
        return result.get("id") if isinstance(result, dict) and isinstance(result.get("id"), str) else None
