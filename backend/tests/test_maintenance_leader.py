from unittest.mock import Mock

import pytest
from sqlalchemy.exc import OperationalError

from app.maintenance_leader import (
    release_maintenance_leadership,
    try_acquire_maintenance_leadership,
)


@pytest.mark.unit
def test_maintenance_leader_keeps_the_winning_connection_open() -> None:
    connection = Mock()
    connection.scalar.return_value = True
    engine = Mock()
    engine.connect.return_value = connection

    result = try_acquire_maintenance_leadership(engine)

    assert result is connection
    connection.close.assert_not_called()


@pytest.mark.unit
def test_maintenance_leader_closes_a_standby_connection() -> None:
    connection = Mock()
    connection.scalar.return_value = False
    engine = Mock()
    engine.connect.return_value = connection

    assert try_acquire_maintenance_leadership(engine) is None
    connection.close.assert_called_once_with()


@pytest.mark.unit
def test_maintenance_leader_closes_connection_when_lock_query_fails() -> None:
    connection = Mock()
    connection.scalar.side_effect = OperationalError("query", {}, RuntimeError("down"))
    engine = Mock()
    engine.connect.return_value = connection

    with pytest.raises(OperationalError):
        try_acquire_maintenance_leadership(engine)

    connection.close.assert_called_once_with()


@pytest.mark.unit
def test_maintenance_leader_releases_lock_before_closing() -> None:
    connection = Mock()

    release_maintenance_leadership(connection)

    connection.execute.assert_called_once()
    connection.close.assert_called_once_with()
