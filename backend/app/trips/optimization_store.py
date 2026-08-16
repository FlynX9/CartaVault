from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
import logging
from threading import Lock
from time import monotonic
from typing import Any
from uuid import UUID, uuid4

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import google_routing_limit_settings
from app.trips.models import RoutingOptimizationProposal

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


class DatabaseOptimizationProposalStore:
    """PostgreSQL-backed proposal storage safe across Uvicorn workers."""

    def __init__(self, *, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds

    def create(self, session: Session, payload: dict[str, Any]) -> UUID:
        proposal_id = uuid4()
        self.restore(session, proposal_id, payload)
        return proposal_id

    def restore(self, session: Session, proposal_id: UUID, payload: dict[str, Any]) -> None:
        try:
            user_id = UUID(str(payload["user_id"]))
            trip_id = UUID(str(payload["trip_id"]))
        except (KeyError, TypeError, ValueError) as error:
            raise OptimizationProposalUnavailable("La proposition d’optimisation est invalide.") from error
        session.merge(RoutingOptimizationProposal(
            id=proposal_id,
            user_id=user_id,
            trip_id=trip_id,
            payload=deepcopy(payload),
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(seconds=self.ttl_seconds),
        ))
        session.commit()

    def take(self, session: Session, proposal_id: UUID) -> dict[str, Any] | None:
        row = session.scalar(
            select(RoutingOptimizationProposal)
            .where(RoutingOptimizationProposal.id == proposal_id)
            .with_for_update()
        )
        if row is None:
            return None
        payload = deepcopy(row.payload)
        expired = row.expires_at <= datetime.now(UTC).replace(tzinfo=None)
        session.delete(row)
        session.commit()
        return None if expired else payload

    def purge_expired(self, session: Session) -> int:
        result = session.execute(
            delete(RoutingOptimizationProposal).where(
                RoutingOptimizationProposal.expires_at <= datetime.now(UTC).replace(tzinfo=None)
            )
        )
        session.commit()
        return int(result.rowcount or 0)


optimization_proposal_store = DatabaseOptimizationProposalStore(
    ttl_seconds=google_routing_limit_settings.proposal_ttl_seconds,
)
