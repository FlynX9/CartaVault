from __future__ import annotations

import pytest

from app.auth.rate_limit import PublicAuthRateLimiter
from app.emails.providers.base import EmailMessage
from app.emails.service import EmailService


pytestmark = pytest.mark.unit


class RecordingProvider:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> str:
        self.messages.append(message)
        return f"message-{len(self.messages)}"


def test_each_email_function_uses_a_repository_template() -> None:
    provider = RecordingProvider()
    service = EmailService(provider)

    service.notify_registration_admins(["admin@example.test"], "candidate@example.test")
    service.notify_registration_approved("candidate@example.test", "Candidate")
    service.send_password_reset("candidate@example.test", "Candidate", "opaque-token")
    service.send_map_share_registration_invitation("invited@example.test", "owner@example.test", "Shared map")
    service.send_resend_verification("admin@example.test", "Admin")

    assert len(provider.messages) == 5
    assert all("Carta" in message.html and "Vault" in message.html for message in provider.messages)
    assert all("#0FA68A" in message.html for message in provider.messages)
    assert "candidate@example.test" in provider.messages[0].text
    assert "Candidate" in provider.messages[1].text
    assert "opaque-token" in provider.messages[2].text
    assert "owner@example.test" in provider.messages[3].text
    assert "Shared map" in provider.messages[3].text
    assert "/register?email=invited%40example.test" in provider.messages[3].text
    assert "Admin" in provider.messages[4].text


def test_email_templates_are_localized_without_changing_their_security_content() -> None:
    provider = RecordingProvider()
    service = EmailService(provider)

    service.notify_registration_admins(["admin@example.test"], "candidate@example.test", "en")
    service.notify_registration_approved("candidate@example.test", "Candidate", "en")
    service.send_password_reset("candidate@example.test", "Candidate", "opaque-token", "en")
    service.send_map_share_registration_invitation("invited@example.test", "owner@example.test", "Shared map", "en")
    service.send_resend_verification("admin@example.test", "Admin", "en")

    assert len(provider.messages) == 5
    assert provider.messages[0].subject == "New CartaVault registration request"
    assert "registration request" in provider.messages[0].text.lower()
    assert "approved" in provider.messages[1].text.lower()
    assert "opaque-token" in provider.messages[2].text
    assert provider.messages[3].subject == "A CartaVault map has been shared with you"
    assert "owner@example.test" in provider.messages[3].text
    assert provider.messages[4].subject == "Your CartaVault email configuration works"
    assert all("#0FA68A" in message.html for message in provider.messages)


def test_public_auth_rate_limiter_rejects_a_burst() -> None:
    limiter = PublicAuthRateLimiter(limit=2, window_seconds=60)
    limiter.check("client")
    limiter.check("client")

    with pytest.raises(Exception) as caught:
        limiter.check("client")

    assert getattr(caught.value, "status_code", None) == 429
