from __future__ import annotations

from collections.abc import Callable
from time import sleep
from typing import TypeVar

from app.emails.providers.base import EmailDeliveryError


Result = TypeVar("Result")


def deliver_with_retry(
    operation: Callable[[], Result],
    *,
    max_attempts: int,
    delay_seconds: int,
    wait: Callable[[float], None] = sleep,
) -> Result:
    """Retry only failures explicitly classified as transient by a provider."""

    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except EmailDeliveryError as error:
            if not error.retryable or attempt == max_attempts:
                raise
            if delay_seconds:
                wait(min(delay_seconds * (2 ** (attempt - 1)), 30))
    raise AssertionError("email retry loop ended without a result")
