from __future__ import annotations

import pytest

from app.emails.providers.base import EmailDeliveryError
from app.emails.providers.retry import deliver_with_retry


pytestmark = pytest.mark.unit


def test_retry_waits_only_between_transient_attempts() -> None:
    attempts = 0
    waits: list[float] = []

    def operation() -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise EmailDeliveryError("EMAIL_PROVIDER_UNAVAILABLE", retryable=True)
        return "sent"

    result = deliver_with_retry(
        operation,
        max_attempts=3,
        delay_seconds=2,
        wait=waits.append,
    )

    assert result == "sent"
    assert attempts == 3
    assert waits == [2, 4]


def test_retry_stops_immediately_on_permanent_failure() -> None:
    attempts = 0

    def operation() -> None:
        nonlocal attempts
        attempts += 1
        raise EmailDeliveryError("EMAIL_PROVIDER_REJECTED")

    with pytest.raises(EmailDeliveryError):
        deliver_with_retry(operation, max_attempts=4, delay_seconds=0)

    assert attempts == 1
