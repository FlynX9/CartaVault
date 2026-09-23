from __future__ import annotations

import logging
import threading

from redis import Redis
from rq import Queue, Worker
from sqlalchemy.exc import SQLAlchemyError

from app.config import task_settings
from app.database import SessionLocal
from app.tasks.cleanup import purge_expired_task_artifacts
from app.tasks.recovery import dispatch_redis, run_recovery_cycle

logger = logging.getLogger(__name__)


def _recovery_loop(stop: threading.Event) -> None:
    # Startup-only recovery is insufficient: a worker that stays alive after a
    # peer crash (or a task orphaned by a killed API process) must eventually
    # be reclaimed without a restart. This bounded loop guarantees detection
    # within roughly one lease duration plus one recovery interval.
    interval = task_settings.recovery_interval_seconds
    while not stop.wait(interval):
        try:
            with SessionLocal() as session:
                run_recovery_cycle(session, dispatch_redis)
        except SQLAlchemyError:
            logger.exception("Task recovery cycle failed")
        except Exception:
            logger.exception("Task recovery cycle interrupted")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    import app.models  # noqa: F401
    import app.tasks.handlers  # noqa: F401

    connection = Redis.from_url(task_settings.redis_url)
    connection.ping()

    session = SessionLocal()
    try:
        purge_expired_task_artifacts(session)
        redispatched, failed, skipped = run_recovery_cycle(session, dispatch_redis)
        logger.info(
            "Task startup recovery complete redispatched=%d exhausted_failed=%d skipped=%d",
            redispatched, failed, skipped,
        )
    finally:
        session.close()

    stop = threading.Event()
    recovery_thread = threading.Thread(target=_recovery_loop, args=(stop,), name="task-recovery-supervisor", daemon=True)
    recovery_thread.start()
    try:
        Worker([Queue(task_settings.queue_name, connection=connection)], connection=connection).work(with_scheduler=False)
    finally:
        stop.set()


if __name__ == "__main__":
    main()
