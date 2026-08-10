from __future__ import annotations

import logging

import pytest

from app.instance_status.logs import InstanceLogHandler, clear_logs_for_tests, query_logs, sanitize_log_text


pytestmark = pytest.mark.unit


def test_log_sanitizer_redacts_credentials_and_minimizes_emails() -> None:
    sanitized = sanitize_log_text(
        "Authorization: Bearer private-token password=hunter2 "
        "api_key=maps-secret user=administrator@example.test"
    )

    assert "private-token" not in sanitized
    assert "hunter2" not in sanitized
    assert "maps-secret" not in sanitized
    assert "administrator@example.test" not in sanitized
    assert "[REDACTED]" in sanitized
    assert "a***@example.test" in sanitized


def test_log_collector_filters_and_pages_bounded_entries() -> None:
    clear_logs_for_tests()
    handler = InstanceLogHandler()
    routing_record = logging.LogRecord(
        "app.routing.provider", logging.WARNING, __file__, 1,
        "Route failed token=provider-secret", (), None,
    )
    media_record = logging.LogRecord(
        "app.photos.storage", logging.INFO, __file__, 2,
        "Photo stored", (), None,
    )
    handler.emit(routing_record)
    handler.emit(media_record)

    items, truncated, next_before = query_logs(level="WARNING", component="ROUTING", limit=1)

    assert len(items) == 1
    assert items[0]["component"] == "ROUTING"
    assert items[0]["level"] == "WARNING"
    assert "provider-secret" not in str(items[0]["message"])
    assert truncated is False
    assert next_before is None
    clear_logs_for_tests()
