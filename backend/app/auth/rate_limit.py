from __future__ import annotations

from collections import OrderedDict, deque
from hashlib import sha256
from threading import Lock
from time import monotonic

from fastapi import HTTPException


class PublicAuthRateLimiter:
    """Small per-process guard for unauthenticated auth endpoints.

    The reverse proxy remains responsible for a distributed limit in production;
    this guard prevents accidental bursts on a single application process.
    """

    def __init__(
        self,
        limit: int = 5,
        window_seconds: int = 15 * 60,
        *,
        max_keys: int = 10_000,
        cleanup_interval: int = 256,
    ) -> None:
        if limit <= 0 or window_seconds <= 0 or max_keys <= 0 or cleanup_interval <= 0:
            raise ValueError("Rate limiter settings must be positive")
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self.cleanup_interval = cleanup_interval
        self._requests: OrderedDict[str, deque[float]] = OrderedDict()
        self._checks = 0
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        threshold = now - self.window_seconds
        with self._lock:
            self._checks += 1
            if self._checks % self.cleanup_interval == 0:
                self._purge_expired_keys(threshold)

            timestamps = self._requests.get(key)
            if timestamps is None:
                if len(self._requests) >= self.max_keys:
                    self._purge_expired_keys(threshold)
                if len(self._requests) >= self.max_keys:
                    self._requests.popitem(last=False)
                timestamps = deque()
                self._requests[key] = timestamps
            else:
                self._requests.move_to_end(key)

            while timestamps and timestamps[0] <= threshold:
                timestamps.popleft()
            if len(timestamps) >= self.limit:
                raise HTTPException(429, "Trop de tentatives. Réessayez dans quelques minutes.")
            timestamps.append(now)

    def _purge_expired_keys(self, threshold: float) -> None:
        expired_keys = [
            key
            for key, timestamps in self._requests.items()
            if not timestamps or timestamps[-1] <= threshold
        ]
        for key in expired_keys:
            self._requests.pop(key, None)


def rate_limit_key(namespace: str, *identifiers: str) -> str:
    """Build an opaque limiter key without retaining raw user PII in memory."""

    identity = "\0".join(identifiers)
    digest = sha256(identity.encode("utf-8")).hexdigest()
    return f"{namespace}:{digest}"


public_auth_rate_limiter = PublicAuthRateLimiter()
