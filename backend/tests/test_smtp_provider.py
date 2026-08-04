from __future__ import annotations

import smtplib
from types import SimpleNamespace

import pytest

from app.config import EmailSettings
from app.emails.providers.base import EmailDeliveryError, EmailMessage
from app.emails.providers.smtp import SMTPEmailProvider


pytestmark = pytest.mark.unit


def _settings(**overrides):
    values = {
        "smtp_host": "smtp.example.test",
        "smtp_port": 587,
        "smtp_security": "starttls",
        "smtp_username": "mailer",
        "smtp_password": "secret",
        "from_name": "CartaVault",
        "from_address": "no-reply@example.test",
        "reply_to": "support@example.test",
        "timeout_seconds": 10,
        "max_attempts": 2,
        "retry_delay_seconds": 0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _message() -> EmailMessage:
    return EmailMessage(
        recipients=["recipient@example.test"],
        subject="CartaVault test",
        html="<p>HTML test</p>",
        text="Plain text test",
    )


def test_smtp_configuration_requires_a_host_and_complete_credentials() -> None:
    with pytest.raises(RuntimeError, match="EMAIL_SMTP_HOST"):
        EmailSettings(provider="smtp", smtp_host="")

    with pytest.raises(RuntimeError, match="configured together"):
        EmailSettings(
            provider="smtp",
            smtp_host="smtp.example.test",
            smtp_username="mailer",
            smtp_password="",
        )

    configured = EmailSettings(
        provider="smtp",
        smtp_host="smtp.example.test",
        smtp_port=465,
        smtp_security="tls",
        smtp_username="mailer",
        smtp_password="secret",
    )
    assert configured.smtp_security == "tls"
    assert "secret" not in repr(configured)


def test_smtp_provider_uses_starttls_auth_and_multipart_message(monkeypatch) -> None:
    events: list[object] = []

    class Client:
        def __init__(self, host, port, timeout):
            events.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def ehlo(self):
            events.append("ehlo")

        def starttls(self, *, context):
            events.append(("starttls", context is not None))

        def login(self, username, password):
            events.append(("login", username, password))

        def send_message(self, message):
            events.append(("send", message))
            return {}

    monkeypatch.setattr("app.emails.providers.smtp.email_settings", _settings())
    monkeypatch.setattr("app.emails.providers.smtp.smtplib.SMTP", Client)

    SMTPEmailProvider().send(_message())

    assert events[:5] == [
        ("connect", "smtp.example.test", 587, 10),
        "ehlo",
        ("starttls", True),
        "ehlo",
        ("login", "mailer", "secret"),
    ]
    sent = events[5][1]
    assert sent["From"] == "CartaVault <no-reply@example.test>"
    assert sent["Reply-To"] == "support@example.test"
    assert sent["Date"]
    assert sent["Message-ID"].endswith("@example.test>")
    assert sent.is_multipart()
    assert "Plain text test" in sent.get_body(preferencelist=("plain",)).get_content()
    assert "HTML test" in sent.get_body(preferencelist=("html",)).get_content()


def test_smtp_provider_retries_a_transient_disconnect(monkeypatch) -> None:
    attempts = 0

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def ehlo(self):
            return None

        def starttls(self, **_kwargs):
            return None

        def login(self, *_args):
            return None

        def send_message(self, _message):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise smtplib.SMTPServerDisconnected("temporary disconnect")
            return {}

    monkeypatch.setattr("app.emails.providers.smtp.email_settings", _settings())
    monkeypatch.setattr("app.emails.providers.smtp.smtplib.SMTP", Client)

    SMTPEmailProvider().send(_message())

    assert attempts == 2


def test_smtp_provider_does_not_retry_authentication_failure(monkeypatch) -> None:
    attempts = 0

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def ehlo(self):
            return None

        def starttls(self, **_kwargs):
            return None

        def login(self, *_args):
            nonlocal attempts
            attempts += 1
            raise smtplib.SMTPAuthenticationError(535, b"invalid credentials")

    monkeypatch.setattr("app.emails.providers.smtp.email_settings", _settings())
    monkeypatch.setattr("app.emails.providers.smtp.smtplib.SMTP", Client)

    with pytest.raises(EmailDeliveryError) as caught:
        SMTPEmailProvider().send(_message())

    assert caught.value.code == "EMAIL_PROVIDER_AUTHENTICATION_FAILED"
    assert caught.value.retryable is False
    assert attempts == 1


def test_smtp_provider_does_not_retry_unsupported_starttls(monkeypatch) -> None:
    attempts = 0

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def ehlo(self):
            return None

        def starttls(self, **_kwargs):
            nonlocal attempts
            attempts += 1
            raise smtplib.SMTPNotSupportedError("STARTTLS unavailable")

    monkeypatch.setattr("app.emails.providers.smtp.email_settings", _settings())
    monkeypatch.setattr("app.emails.providers.smtp.smtplib.SMTP", Client)

    with pytest.raises(EmailDeliveryError) as caught:
        SMTPEmailProvider().send(_message())

    assert caught.value.code == "EMAIL_PROVIDER_TLS_UNAVAILABLE"
    assert caught.value.retryable is False
    assert attempts == 1


def test_smtp_provider_supports_implicit_tls_without_authentication(monkeypatch) -> None:
    captured: list[object] = []

    class Client:
        def __init__(self, host, port, timeout, context):
            captured.append((host, port, timeout, context is not None))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def send_message(self, _message):
            return {}

    monkeypatch.setattr(
        "app.emails.providers.smtp.email_settings",
        _settings(
            smtp_port=465,
            smtp_security="tls",
            smtp_username="",
            smtp_password="",
        ),
    )
    monkeypatch.setattr("app.emails.providers.smtp.smtplib.SMTP_SSL", Client)

    SMTPEmailProvider().send(_message())

    assert captured == [("smtp.example.test", 465, 10, True)]
