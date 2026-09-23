import asyncio
import socket
from unittest.mock import MagicMock, Mock

import pytest
from fastapi import Response
from sqlalchemy.exc import SQLAlchemyError

from app.main import healthz, readiness


pytestmark = pytest.mark.unit


def test_liveness_does_not_depend_on_database() -> None:
    assert asyncio.run(healthz()) == {"status": "ok"}


def test_readiness_is_ready_when_database_probe_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    response = Response()
    readiness_connection = Mock()
    readiness_engine = MagicMock()
    readiness_engine.connect.return_value.__enter__.return_value = readiness_connection
    monkeypatch.setattr("app.main.readiness_engine", readiness_engine)
    async def healthy_socket() -> None:
        return None
    monkeypatch.setattr("app.main._probe_readiness_socket", healthy_socket)

    assert asyncio.run(readiness(response)) == {"status": "ready"}
    assert response.status_code == 200
    readiness_connection.execute.assert_called_once()


def test_readiness_is_not_ready_without_leaking_database_error(monkeypatch: pytest.MonkeyPatch) -> None:
    response = Response()
    connection = Mock()
    connection.execute.side_effect = SQLAlchemyError("private database details")
    readiness_engine = MagicMock()
    readiness_engine.connect.return_value.__enter__.return_value = connection
    monkeypatch.setattr("app.main.readiness_engine", readiness_engine)
    async def healthy_socket() -> None:
        return None
    monkeypatch.setattr("app.main._probe_readiness_socket", healthy_socket)

    assert asyncio.run(readiness(response)) == {"status": "not_ready"}
    assert response.status_code == 503
    assert "private database details" not in response.body.decode()


def test_readiness_is_not_ready_when_fresh_connection_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    response = Response()
    readiness_engine = Mock()
    readiness_engine.connect.side_effect = SQLAlchemyError("connection is closed")
    monkeypatch.setattr("app.main.readiness_engine", readiness_engine)

    assert asyncio.run(readiness(response)) == {"status": "not_ready"}
    assert response.status_code == 503


@pytest.mark.parametrize(
    "error",
    [
        ConnectionRefusedError("database refused"),
        ConnectionResetError("database reset"),
        socket.gaierror(socket.EAI_AGAIN, "temporary DNS failure"),
        TimeoutError("database probe timed out"),
    ],
)
def test_readiness_maps_operational_socket_failures_to_not_ready(
    monkeypatch: pytest.MonkeyPatch,
    error: OSError,
) -> None:
    response = Response()

    async def failed_socket() -> None:
        raise error

    monkeypatch.setattr("app.main._probe_readiness_socket", failed_socket)

    assert asyncio.run(readiness(response)) == {"status": "not_ready"}
    assert response.status_code == 503


def test_readiness_does_not_swallow_programming_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    response = Response()

    async def broken_socket() -> None:
        raise RuntimeError("programming failure")

    monkeypatch.setattr("app.main._probe_readiness_socket", broken_socket)

    with pytest.raises(RuntimeError, match="programming failure"):
        asyncio.run(readiness(response))
