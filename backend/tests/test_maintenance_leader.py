import asyncio
import socket
import threading
import time
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from app.maintenance_leader import (
    MaintenanceGenerationLost,
    MaintenanceLeaderSupervisor,
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


@pytest.mark.unit
def test_supervisor_reacquires_after_liveness_connection_loss() -> None:
    first = Mock(closed=False)
    first.scalar.side_effect = OperationalError("ping", {}, RuntimeError("database restarted"))
    second = Mock(closed=False)
    acquisitions = iter((first, second))
    acquired: list[object] = []
    lost: list[object] = []
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=0.001,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.002,
        reconnect_jitter_seconds=0,
        acquire=lambda _engine: next(acquisitions),
    )

    async def on_acquired() -> None:
        acquired.append(supervisor.connection)
        if len(acquired) == 2:
            supervisor.stop()

    async def on_lost() -> None:
        lost.append(True)

    asyncio.run(supervisor.run(on_acquired, on_lost))

    assert len(acquired) == 2
    assert len(lost) == 2
    first.invalidate.assert_called_once_with()
    first.close.assert_called_once_with()
    second.execute.assert_called_once()
    second.close.assert_called_once_with()
    assert not supervisor.is_leader


@pytest.mark.unit
def test_supervisor_treats_lock_busy_as_follower_and_retries() -> None:
    second = Mock(closed=False)
    attempts = iter((None, second))
    acquired = 0
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=0.001,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.002,
        reconnect_jitter_seconds=0,
        acquire=lambda _engine: next(attempts),
    )

    async def on_acquired() -> None:
        nonlocal acquired
        acquired += 1
        supervisor.stop()

    async def on_lost() -> None:
        return None

    asyncio.run(supervisor.run(on_acquired, on_lost))

    assert acquired == 1
    assert second.close.call_count == 1


@pytest.mark.unit
def test_supervisor_shutdown_interrupts_reconnect_backoff() -> None:
    attempts = 0

    def unavailable(_engine):
        nonlocal attempts
        attempts += 1
        raise OperationalError("connect", {}, RuntimeError("offline"))

    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=1,
        reconnect_initial_seconds=10,
        reconnect_max_seconds=10,
        reconnect_jitter_seconds=0,
        acquire=unavailable,
    )

    async def run_and_stop() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), lambda: asyncio.sleep(0)))
        await asyncio.sleep(0.01)
        supervisor.stop()
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run_and_stop())

    assert attempts == 1


@pytest.mark.unit
def test_supervisor_logs_and_retries_unexpected_liveness_error(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = Mock(closed=False)
    connection.scalar.side_effect = RuntimeError("unexpected driver failure")
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=0.001,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.001,
        reconnect_jitter_seconds=0,
        acquire=lambda _engine: connection,
    )

    async def on_acquired() -> None:
        if connection.scalar.call_count > 1:
            supervisor.stop()

    async def on_lost() -> None:
        return None

    exception_log = Mock()
    monkeypatch.setattr("app.maintenance_leader.logger.exception", exception_log)
    asyncio.run(supervisor.run(on_acquired, on_lost))

    assert any(
        call.args[0] == "maintenance_leader_supervisor_unexpected_liveness_error"
        for call in exception_log.call_args_list
    )
    assert not supervisor.is_leader


@pytest.mark.unit
def test_supervisor_liveness_probe_does_not_block_event_loop() -> None:
    started = threading.Event()
    release = threading.Event()
    connection = Mock(closed=False)

    def blocking_probe(_statement):
        started.set()
        release.wait(timeout=1)

    connection.scalar.side_effect = blocking_probe
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=1,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.001,
        reconnect_jitter_seconds=0,
        operation_timeout_seconds=0.5,
        acquire=lambda _engine: connection,
    )

    async def run_and_check_loop() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), lambda: asyncio.sleep(0)))
        assert await asyncio.to_thread(started.wait, 1)
        started_at = time.monotonic()
        try:
            await asyncio.sleep(0.02)
            assert time.monotonic() - started_at < 0.15
        finally:
            release.set()
            supervisor.stop()
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run_and_check_loop())


@pytest.mark.unit
def test_supervisor_unlock_does_not_block_event_loop_during_shutdown() -> None:
    started = threading.Event()
    release = threading.Event()
    connection = Mock(closed=False)
    connection.scalar.return_value = None

    def blocking_unlock(_statement, _parameters):
        started.set()
        release.wait(timeout=1)

    connection.execute.side_effect = blocking_unlock
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=1,
        reconnect_jitter_seconds=0,
        operation_timeout_seconds=0.5,
        acquire=lambda _engine: connection,
    )

    async def run_and_check_loop() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), lambda: asyncio.sleep(0)))
        await asyncio.sleep(0.01)
        stopping_at = time.monotonic()
        supervisor.stop()
        release_timer = threading.Timer(0.2, release.set)
        release_timer.daemon = True
        release_timer.start()
        try:
            assert await asyncio.to_thread(started.wait, 1)
            await asyncio.sleep(0.02)
            assert time.monotonic() - stopping_at < 0.15
        finally:
            release.set()
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run_and_check_loop())


@pytest.mark.unit
def test_supervisor_discards_half_open_connection_after_bounded_probe_timeout() -> None:
    started = threading.Event()
    release = threading.Event()
    connection = Mock(closed=False)

    def half_open_probe(_statement):
        started.set()
        release.wait(timeout=1)

    connection.scalar.side_effect = half_open_probe
    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=1,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.001,
        reconnect_jitter_seconds=0,
        operation_timeout_seconds=0.01,
        acquire=lambda _engine: connection,
    )
    lost = 0

    async def on_lost() -> None:
        nonlocal lost
        lost += 1
        supervisor.stop()

    async def run_supervisor() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), on_lost))
        assert await asyncio.to_thread(started.wait, 1)
        await asyncio.wait_for(task, timeout=1)

    try:
        asyncio.run(run_supervisor())
    finally:
        release.set()

    assert lost == 1
    connection.invalidate.assert_called_once_with()
    connection.close.assert_called_once_with()
    assert not supervisor.is_leader


@pytest.mark.unit
def test_supervisor_stale_generation_cannot_release_new_leadership_connection() -> None:
    old_connection = Mock(closed=False)
    new_connection = Mock(closed=False)
    supervisor = MaintenanceLeaderSupervisor(Mock(), reconnect_jitter_seconds=0)
    supervisor._connection = old_connection
    supervisor._connection_generation = 1
    supervisor._next_generation = 1
    supervisor._leader = True

    async def on_lost() -> None:
        supervisor._connection = new_connection
        supervisor._connection_generation = 2
        supervisor._leader = True

    async def lose_old_generation() -> None:
        await supervisor._lose_leadership(
            on_lost,
            broken=False,
            connection=old_connection,
            generation=1,
        )

    asyncio.run(lose_old_generation())

    old_connection.execute.assert_called_once()
    new_connection.execute.assert_not_called()
    assert supervisor.connection is new_connection
    assert supervisor.is_leader


@pytest.mark.unit
def test_supervisor_does_not_start_stale_generation_operation() -> None:
    supervisor = MaintenanceLeaderSupervisor(Mock(), reconnect_jitter_seconds=0)
    supervisor._leader = False
    supervisor._connection_generation = 4
    called = False

    def operation() -> None:
        nonlocal called
        called = True

    async def run_operation() -> None:
        with pytest.raises(MaintenanceGenerationLost):
            await supervisor.run_leader_operation(4, operation)

    asyncio.run(run_operation())

    assert called is False


@pytest.mark.unit
def test_supervisor_bounds_half_open_leadership_acquisition() -> None:
    started = threading.Event()
    release = threading.Event()

    def acquire(_engine):
        started.set()
        release.wait(timeout=1)
        return None

    supervisor = MaintenanceLeaderSupervisor(
        Mock(),
        check_interval_seconds=1,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.001,
        reconnect_jitter_seconds=0,
        operation_timeout_seconds=0.01,
        acquire=acquire,
    )

    async def run_and_check_loop() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), lambda: asyncio.sleep(0)))
        assert await asyncio.to_thread(started.wait, 1)
        started_at = time.monotonic()
        await asyncio.sleep(0.02)
        assert time.monotonic() - started_at < 0.15
        supervisor.stop()
        release.set()
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run_and_check_loop())


@pytest.mark.unit
def test_supervisor_generation_fence_rejects_late_operation_completion() -> None:
    started = threading.Event()
    release = threading.Event()
    supervisor = MaintenanceLeaderSupervisor(Mock(), reconnect_jitter_seconds=0)
    supervisor._leader = True
    supervisor._connection_generation = 1

    def operation() -> None:
        started.set()
        release.wait(timeout=1)
        if not supervisor.is_current_generation(1):
            raise MaintenanceGenerationLost()

    async def run_operation() -> None:
        task = asyncio.create_task(supervisor.run_leader_operation(1, operation))
        assert await asyncio.to_thread(started.wait, 1)
        supervisor._leader = False
        release.set()
        with pytest.raises(MaintenanceGenerationLost):
            await task

    asyncio.run(run_operation())


@pytest.mark.unit
def test_supervisor_bounds_real_half_open_postgres_acquisition() -> None:
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    accepted = threading.Event()
    release = threading.Event()

    def blackhole() -> None:
        try:
            connection, _ = listener.accept()
            accepted.set()
            release.wait(timeout=1)
            connection.close()
        finally:
            listener.close()

    thread = threading.Thread(target=blackhole, daemon=True)
    thread.start()
    engine = create_engine(
        f"postgresql+psycopg://cartavault:test@127.0.0.1:{port}/postgres",
        connect_args={"connect_timeout": 60},
    )
    supervisor = MaintenanceLeaderSupervisor(
        engine,
        check_interval_seconds=1,
        reconnect_initial_seconds=0.001,
        reconnect_max_seconds=0.001,
        reconnect_jitter_seconds=0,
        operation_timeout_seconds=0.01,
        acquire=try_acquire_maintenance_leadership,
    )

    async def run_and_check_loop() -> None:
        task = asyncio.create_task(supervisor.run(lambda: asyncio.sleep(0), lambda: asyncio.sleep(0)))
        assert await asyncio.to_thread(accepted.wait, 1)
        started_at = time.monotonic()
        await asyncio.sleep(0.02)
        assert time.monotonic() - started_at < 0.15
        supervisor.stop()
        release.set()
        await asyncio.wait_for(task, timeout=1)

    try:
        asyncio.run(run_and_check_loop())
    finally:
        release.set()
        listener.close()
        engine.dispose()
