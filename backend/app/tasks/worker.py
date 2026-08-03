from __future__ import annotations

import logging

from redis import Redis
from rq import Queue, Worker

from app.config import task_settings
from app.database import SessionLocal
from app.tasks.service import recover_abandoned_tasks, requeue_pending_tasks
from app.tasks.cleanup import purge_expired_task_artifacts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    import app.models  # noqa: F401
    import app.tasks.handlers  # noqa: F401

    session = SessionLocal()
    try:
        purge_expired_task_artifacts(session)
        abandoned, expired = recover_abandoned_tasks(session)
        requeued = requeue_pending_tasks(session)
        logging.getLogger(__name__).info(
            "Task recovery complete abandoned=%d expired=%d requeued=%d", abandoned, expired, requeued,
        )
    finally:
        session.close()
    connection = Redis.from_url(task_settings.redis_url)
    connection.ping()
    Worker([Queue(task_settings.queue_name, connection=connection)], connection=connection).work(with_scheduler=False)


if __name__ == "__main__":
    main()
