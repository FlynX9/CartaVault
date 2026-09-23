"""Cross-worker leadership for in-process periodic maintenance."""

from __future__ import annotations

import asyncio
import logging
import os
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
MAINTENANCE_LOCK_NAME = "cartavault:v1:maintenance-leader"


def _instance_identity() -> str:
    return os.getenv("CARTAVAULT_INSTANCE_ID", "unknown")


def try_acquire_maintenance_leadership(engine: Engine) -> Connection | None:
    """Keep one PostgreSQL session lock for the lifetime of the elected worker."""

    connection = engine.connect()
    try:
        acquired = connection.scalar(
            text("SELECT pg_try_advisory_lock(hashtext(:lock_name))"),
            {"lock_name": MAINTENANCE_LOCK_NAME},
        )
    except Exception:
        # A failed checkout/query must never return a potentially contaminated
        # session-level lock connection to the pool.
        try:
            connection.invalidate()
        except Exception:
            logger.debug("maintenance_leader_connection_invalidate_failed", exc_info=True)
        connection.close()
        raise
    if acquired:
        logger.info("maintenance_leader_acquired instance=%s", _instance_identity())
        return connection
    connection.close()
    logger.info("maintenance_leader_standby instance=%s", _instance_identity())
    return None


def release_maintenance_leadership(connection: Connection) -> None:
    try:
        try:
            connection.execute(
                text("SELECT pg_advisory_unlock(hashtext(:lock_name))"),
                {"lock_name": MAINTENANCE_LOCK_NAME},
            )
            logger.info("maintenance_leader_released")
        except SQLAlchemyError:
            # PostgreSQL releases a session lock when its dead connection is
            # closed. Unlock is therefore best effort during shutdown.
            logger.info("maintenance_leader_release_skipped_connection_lost")
    finally:
        connection.close()


AsyncTransition = Callable[[], Awaitable[None]]
_OperationResult = TypeVar("_OperationResult")


class MaintenanceGenerationLost(RuntimeError):
    """Raised when work from an older leadership lease tries to continue."""


def _consume_finished_operation(task: asyncio.Task[object]) -> None:
    """Consume a late worker result after its async wait has timed out."""

    if not task.cancelled():
        task.exception()


class MaintenanceLeaderSupervisor:
    """Own and continuously supervise one dedicated advisory-lock connection."""

    def __init__(
        self,
        engine: Engine,
        *,
        check_interval_seconds: float = 2,
        reconnect_initial_seconds: float = 1,
        reconnect_max_seconds: float = 15,
        reconnect_jitter_seconds: float = 1,
        operation_timeout_seconds: float = 5,
        acquire: Callable[[Engine], Connection | None] = try_acquire_maintenance_leadership,
    ) -> None:
        self.engine = engine
        self.check_interval_seconds = check_interval_seconds
        self.reconnect_initial_seconds = reconnect_initial_seconds
        self.reconnect_max_seconds = reconnect_max_seconds
        self.reconnect_jitter_seconds = reconnect_jitter_seconds
        self.operation_timeout_seconds = operation_timeout_seconds
        self._acquire = acquire
        self._connection: Connection | None = None
        self._connection_generation: int | None = None
        self._next_generation = 0
        self._leader = False
        self._stopping = asyncio.Event()

    @property
    def is_leader(self) -> bool:
        return self._leader

    @property
    def connection(self) -> Connection | None:
        return self._connection

    @property
    def generation(self) -> int | None:
        return self._connection_generation

    def is_current_generation(self, generation: int) -> bool:
        return self._leader and self._connection_generation == generation

    async def run_leader_operation(
        self,
        generation: int,
        operation: Callable[[], _OperationResult],
    ) -> _OperationResult:
        if not self.is_current_generation(generation):
            raise MaintenanceGenerationLost()
        result = await self._run_bounded_operation(operation)
        if not self.is_current_generation(generation):
            raise MaintenanceGenerationLost()
        return result

    def stop(self) -> None:
        self._stopping.set()

    async def _wait(self, seconds: float) -> bool:
        if self._stopping.is_set():
            return False
        timeout = seconds + random.uniform(0, self.reconnect_jitter_seconds)
        try:
            await asyncio.wait_for(self._stopping.wait(), timeout=timeout)
        except TimeoutError:
            return not self._stopping.is_set()
        return False

    async def _close_connection(self, *, broken: bool) -> None:
        connection = self._connection
        self._connection = None
        self._connection_generation = None
        if connection is None:
            return
        try:
            await self._run_bounded_operation(lambda: self._dispose_connection(connection))
        except (SQLAlchemyError, OSError, TimeoutError):
            logger.info("maintenance_leader_close_incomplete broken=%s", broken)

    def _lease_matches(self, connection: Connection, generation: int) -> bool:
        return self._connection is connection and self._connection_generation == generation

    async def _run_bounded_operation(
        self,
        operation: Callable[[], _OperationResult],
    ) -> _OperationResult:
        """Run synchronous driver work without allowing it to block the loop.

        ``wait_for`` cannot stop a thread already executing a database call.
        Shielding the worker task makes that fact explicit: a late result is
        consumed and, importantly, cannot resume supervisor state transitions.
        Callers discard the dedicated leadership connection on the timeout path.
        """

        operation_task: asyncio.Task[_OperationResult] = asyncio.create_task(asyncio.to_thread(operation))
        try:
            return await asyncio.wait_for(
                asyncio.shield(operation_task),
                timeout=self.operation_timeout_seconds,
            )
        except TimeoutError:
            operation_task.add_done_callback(_consume_finished_operation)
            raise
        except asyncio.CancelledError:
            operation_task.add_done_callback(_consume_finished_operation)
            raise

    async def _dispose_leadership_connection(
        self,
        connection: Connection,
        generation: int,
        *,
        broken: bool,
    ) -> None:
        if self._lease_matches(connection, generation):
            self._connection = None
            self._connection_generation = None
        try:
            if broken:
                await self._run_bounded_operation(
                    lambda: self._dispose_connection(connection),
                )
            else:
                await self._run_bounded_operation(
                    lambda: release_maintenance_leadership(connection),
                )
        except (SQLAlchemyError, OSError, TimeoutError):
            # The lease is already detached. A failed or timed-out cleanup must
            # not stop the supervisor or make it touch a later generation.
            logger.info("maintenance_leader_cleanup_incomplete")

    @staticmethod
    def _dispose_connection(connection: Connection) -> None:
        try:
            connection.invalidate()
        except Exception:
            logger.debug("maintenance_leader_connection_invalidate_failed", exc_info=True)
        try:
            connection.close()
        except Exception:
            logger.debug("maintenance_leader_connection_close_failed", exc_info=True)

    def _dispose_late_acquired_connection(self, task: asyncio.Task[Connection | None]) -> None:
        if task.cancelled():
            return
        try:
            connection = task.result()
        except Exception:
            return
        if connection is not None:
            # Acquisition timed out, so a late lock winner must not leak its
            # session-level advisory lock into the pool.
            asyncio.create_task(asyncio.to_thread(self._dispose_connection, connection))

    async def _lose_leadership(
        self,
        on_lost: AsyncTransition,
        *,
        broken: bool,
        connection: Connection | None = None,
        generation: int | None = None,
    ) -> None:
        if connection is None:
            connection = self._connection
        if generation is None:
            generation = self._connection_generation
        if connection is None or generation is None or not self._lease_matches(connection, generation):
            return
        self._leader = False
        logger.warning("maintenance_leader_lost instance=%s", _instance_identity())
        try:
            await on_lost()
        finally:
            # Never issue pg_advisory_unlock on a connection confirmed dead.
            # The generation and captured connection prevent a late cleanup
            # from detaching or unlocking a newer leadership lease.
            await self._dispose_leadership_connection(connection, generation, broken=broken)

    async def run(self, on_acquired: AsyncTransition, on_lost: AsyncTransition) -> None:
        retry_delay = self.reconnect_initial_seconds
        logger.info("maintenance_leader_supervisor_started instance=%s", _instance_identity())
        try:
            while not self._stopping.is_set():
                if self._connection is None:
                    try:
                        acquire_task: asyncio.Task[Connection | None] = asyncio.create_task(
                            asyncio.to_thread(self._acquire, self.engine)
                        )
                        try:
                            connection = await asyncio.wait_for(
                                asyncio.shield(acquire_task),
                                timeout=self.operation_timeout_seconds,
                            )
                        except (TimeoutError, asyncio.CancelledError):
                            acquire_task.add_done_callback(self._dispose_late_acquired_connection)
                            raise
                    except asyncio.CancelledError:
                        raise
                    except SQLAlchemyError as error:
                        logger.warning(
                            "maintenance_db_connection_lost retry_in=%.1fs error=%s",
                            retry_delay,
                            type(error).__name__,
                        )
                        logger.info("maintenance_leader_reacquire_scheduled retry_in=%.1fs", retry_delay)
                        await self._wait(retry_delay)
                        retry_delay = min(self.reconnect_max_seconds, retry_delay * 2)
                        continue
                    except Exception:
                        logger.exception("maintenance_leader_supervisor_unexpected_acquire_error")
                        await self._wait(retry_delay)
                        retry_delay = min(self.reconnect_max_seconds, retry_delay * 2)
                        continue

                    if connection is None:
                        retry_delay = self.reconnect_initial_seconds
                        logger.info("maintenance_follower_waiting retry_in=%.1fs", self.check_interval_seconds)
                        await self._wait(self.check_interval_seconds)
                        continue

                    self._next_generation += 1
                    generation = self._next_generation
                    self._connection = connection
                    self._connection_generation = generation
                    self._leader = True
                    retry_delay = self.reconnect_initial_seconds
                    try:
                        logger.info("maintenance_leader_reacquired instance=%s", _instance_identity())
                        await on_acquired()
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception("maintenance_leader_start_failed")
                        await self._lose_leadership(on_lost, broken=False)
                        await self._wait(retry_delay)
                        continue

                connection = self._connection
                if connection is None:
                    continue
                try:
                    generation = self._connection_generation
                    if generation is None:
                        continue
                    if connection.closed:
                        raise ConnectionError("maintenance leader connection is closed")
                    # This query must use the same checked-out session that owns
                    # the session-level advisory lock.
                    await self._run_bounded_operation(
                        lambda: connection.scalar(text("SELECT 1")),
                    )
                except asyncio.CancelledError:
                    raise
                except (SQLAlchemyError, OSError, ConnectionError) as error:
                    logger.warning(
                        "maintenance_db_connection_lost error=%s",
                        type(error).__name__,
                    )
                    await self._lose_leadership(
                        on_lost,
                        broken=True,
                        connection=connection,
                        generation=generation,
                    )
                    await self._wait(retry_delay)
                    retry_delay = min(self.reconnect_max_seconds, retry_delay * 2)
                    continue
                except Exception:
                    logger.exception("maintenance_leader_supervisor_unexpected_liveness_error")
                    await self._lose_leadership(
                        on_lost,
                        broken=True,
                        connection=connection,
                        generation=generation,
                    )
                    await self._wait(retry_delay)
                    retry_delay = min(self.reconnect_max_seconds, retry_delay * 2)
                    continue
                await self._wait(self.check_interval_seconds)
        finally:
            if self._leader:
                await self._lose_leadership(on_lost, broken=False)
            else:
                await self._close_connection(broken=True)
            logger.info("maintenance_supervisor_stopping")
