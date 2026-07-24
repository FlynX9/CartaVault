from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.emails.providers.base import EmailDeliveryError, EmailMessage
from app.emails.providers.resend import ResendEmailProvider


pytestmark = pytest.mark.unit


def _message() -> EmailMessage:
    return EmailMessage(
        recipients=["recipient@example.test"],
        subject="CartaVault test",
        html="<p>Test</p>",
        text="Test",
    )


def test_resend_provider_rejects_an_empty_sender(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.emails.providers.resend.email_settings",
        SimpleNamespace(
            from_name="CartaVault",
            from_address="",
            reply_to="",
            timeout_seconds=10,
        ),
    )

    with pytest.raises(EmailDeliveryError) as caught:
        ResendEmailProvider("re_test").send(_message())

    assert caught.value.code == "EMAIL_SENDER_NOT_CONFIGURED"


def test_resend_provider_omits_an_empty_reply_to(monkeypatch) -> None:
    captured_payload: dict[str, object] = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self) -> bytes:
            return b'{"id":"email-id"}'

    def fake_urlopen(request, **_kwargs):
        captured_payload.update(json.loads(request.data.decode("utf-8")))
        return Response()

    monkeypatch.setattr(
        "app.emails.providers.resend.email_settings",
        SimpleNamespace(
            from_name="CartaVault",
            from_address="no-reply@example.test",
            reply_to="",
            timeout_seconds=10,
        ),
    )
    monkeypatch.setattr("app.emails.providers.resend.urlopen", fake_urlopen)

    message_id = ResendEmailProvider("re_test").send(_message())

    assert message_id == "email-id"
    assert captured_payload["from"] == "CartaVault <no-reply@example.test>"
    assert "reply_to" not in captured_payload
