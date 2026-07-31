from __future__ import annotations

import pytest
from types import SimpleNamespace

from app.auth import rate_limit
from app.auth.rate_limit import PublicAuthRateLimiter, rate_limit_key
from app.emails.providers.base import EmailMessage
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database


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
    service.send_map_share_invitation("new@example.test", "owner@example.test", "New account map", "new-token", True)
    service.send_map_share_invitation("member@example.test", "owner@example.test", "Member map", "member-token", False)
    service.notify_password_changed("candidate@example.test", "Candidate")
    service.notify_email_changed("old@example.test", "Candidate", "old@example.test", "new@example.test")
    service.send_resend_verification("admin@example.test", "Admin")

    assert len(provider.messages) == 8
    assert all("Carta" in message.html and "Vault" in message.html for message in provider.messages)
    assert all("#0FA68A" in message.html for message in provider.messages)
    assert "candidate@example.test" in provider.messages[0].text
    assert "Candidate" in provider.messages[1].text
    assert "opaque-token" in provider.messages[2].text
    assert "owner@example.test" in provider.messages[3].text
    assert "New account map" in provider.messages[3].text
    assert "/invitations/new-token" in provider.messages[3].text
    assert "/invitations/member-token" in provider.messages[4].text
    assert "mot de passe" in provider.messages[5].subject.lower()
    assert "old@example.test" in provider.messages[6].text
    assert "new@example.test" in provider.messages[6].text
    assert "Admin" in provider.messages[7].text


def test_email_templates_are_localized_without_changing_their_security_content() -> None:
    provider = RecordingProvider()
    service = EmailService(provider)

    service.notify_registration_admins(["admin@example.test"], "candidate@example.test", "en")
    service.notify_registration_approved("candidate@example.test", "Candidate", "en")
    service.send_password_reset("candidate@example.test", "Candidate", "opaque-token", "en")
    service.send_map_share_invitation("invited@example.test", "owner@example.test", "Shared map", "invite-token", False, "en")
    service.notify_password_changed("candidate@example.test", "Candidate", "en")
    service.notify_email_changed("old@example.test", "Candidate", "old@example.test", "new@example.test", "en")
    service.send_resend_verification("admin@example.test", "Admin", "en")

    assert len(provider.messages) == 7
    assert provider.messages[0].subject == "New CartaVault registration request"
    assert "registration request" in provider.messages[0].text.lower()
    assert "approved" in provider.messages[1].text.lower()
    assert "opaque-token" in provider.messages[2].text
    assert provider.messages[3].subject == "A CartaVault map has been shared with you"
    assert "owner@example.test" in provider.messages[3].text
    assert provider.messages[4].subject == "Your CartaVault password was changed"
    assert provider.messages[5].subject == "Your CartaVault email address was changed"
    assert provider.messages[6].subject == "Your CartaVault email configuration works"
    assert all("#0FA68A" in message.html for message in provider.messages)


def test_email_delivery_can_be_explicitly_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.emails.service.email_settings", SimpleNamespace(provider="none"))

    with pytest.raises(EmailDeliveryError) as caught:
        provider_from_database(object())  # type: ignore[arg-type]

    assert caught.value.code == "EMAIL_DELIVERY_DISABLED"


def test_public_auth_rate_limiter_rejects_a_burst() -> None:
    limiter = PublicAuthRateLimiter(limit=2, window_seconds=60)
    limiter.check("client")
    limiter.check("client")

    with pytest.raises(Exception) as caught:
        limiter.check("client")

    assert getattr(caught.value, "status_code", None) == 429


def test_public_auth_rate_limiter_discards_expired_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 0.0
    monkeypatch.setattr(rate_limit, "monotonic", lambda: now)
    limiter = PublicAuthRateLimiter(
        limit=2,
        window_seconds=60,
        max_keys=2,
        cleanup_interval=1,
    )
    limiter.check("first")
    limiter.check("second")

    now = 61.0
    limiter.check("third")
    limiter.check("fourth")


def test_rate_limit_keys_do_not_retain_personal_identifiers() -> None:
    key = rate_limit_key("login", "192.0.2.1", "person@example.test")

    assert key.startswith("login:")
    assert "192.0.2.1" not in key
    assert "person@example.test" not in key


def test_public_auth_rate_limiter_keeps_a_bounded_identity_registry() -> None:
    limiter = PublicAuthRateLimiter(
        limit=2,
        window_seconds=60,
        max_keys=2,
        cleanup_interval=10,
    )

    limiter.check("first")
    limiter.check("second")
    limiter.check("third")

    assert len(limiter._requests) == 2
    assert "first" not in limiter._requests
