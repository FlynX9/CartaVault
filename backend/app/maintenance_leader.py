"""Cross-worker leadership for in-process periodic maintenance."""

from __future__ import annotations

import logging

from sqlalchemy import Engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger(__name__)
MAINTENANCE_LOCK_NAME = "cartavault:v1:maintenance-leader"


def try_acquire_maintenance_leadership(engine: Engine) -> Connection | None:
    """Keep one PostgreSQL session lock for the lifetime of the elected worker."""

    connection = engine.connect()
    try:
        acquired = connection.scalar(
            text("SELECT pg_try_advisory_lock(hashtext(:lock_name))"),
            {"lock_name": MAINTENANCE_LOCK_NAME},
        )
    except SQLAlchemyError:
        connection.close()
        raise
    if acquired:
        logger.info("maintenance_leader_acquired")
        return connection
    connection.close()
    logger.info("maintenance_leader_standby")
    return None


def release_maintenance_leadership(connection: Connection) -> None:
    try:
        connection.execute(
            text("SELECT pg_advisory_unlock(hashtext(:lock_name))"),
            {"lock_name": MAINTENANCE_LOCK_NAME},
        )
        logger.info("maintenance_leader_released")
    finally:
        connection.close()
