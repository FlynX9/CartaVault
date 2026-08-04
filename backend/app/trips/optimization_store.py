from __future__ import annotations

from copy import deepcopy
import json
import logging
from threading import Lock
from time import monotonic
from typing import Any
from uuid import UUID, uuid4

from redis import Redis
from redis.exceptions import RedisError

from app.config import google_routing_limit_settings, task_settings

logger = logging.getLogger(__name__)


class OptimizationProposalUnavailable(RuntimeError):
    pass


class OptimizationProposalStore:
    """Short-lived server-side storage for unconfirmed routing results."""

    def __init__(self, *, ttl_seconds: int, redis_client: Redis | None = None):
        self.ttl_seconds = ttl_seconds
        self._redis = redis_client
        self._memory: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = Lock()

    def create(self, payload: dict[str, Any]) -> UUID:
        proposal_id = uuid4()
        self.restore(proposal_id, payload)
        return proposal_id

    def restore(self, proposal_id: UUID, payload: dict[str, Any]) -> None:
        key = self._key(proposal_id)
        if self._redis is not None:
            try:
                self._redis.setex(key, self.ttl_seconds, json.dumps(payload, separators=(",", ":")))
                return
            except RedisError as error:
                logger.exception("Unable to store routing proposal in Redis")
                raise OptimizationProposalUnavailable("Le stockage temporaire des optimisations est indisponible.") from error
        with self._lock:
            self._purge_memory()
            self._memory[key] = (monotonic() + self.ttl_seconds, deepcopy(payload))

    def take(self, proposal_id: UUID) -> dict[str, Any] | None:
        key = self._key(proposal_id)
        if self._redis is not None:
            try:
                raw = self._redis.getdel(key)
            except RedisError as error:
                logger.exception("Unable to consume routing proposal from Redis")
                raise OptimizationProposalUnavailable("Le stockage temporaire des optimisations est indisponible.") from error
            if raw is None:
                return None
            return json.loads(raw)
        with self._lock:
            self._purge_memory()
            stored = self._memory.pop(key, None)
            return deepcopy(stored[1]) if stored else None

    def _purge_memory(self) -> None:
        now = monotonic()
        for key, (expires_at, _) in list(self._memory.items()):
            if expires_at <= now:
                self._memory.pop(key, None)

    @staticmethod
    def _key(proposal_id: UUID) -> str:
        return f"cartavault:routing:proposal:{proposal_id}"


def _redis_client() -> Redis | None:
    if task_settings.mode != "redis":
        return None
    return Redis.from_url(task_settings.redis_url, decode_responses=True)


optimization_proposal_store = OptimizationProposalStore(
    ttl_seconds=google_routing_limit_settings.proposal_ttl_seconds,
    redis_client=_redis_client(),
)
