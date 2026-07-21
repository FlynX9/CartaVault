from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException


class PublicAuthRateLimiter:
    """Small per-process guard for unauthenticated auth endpoints.

    The reverse proxy remains responsible for a distributed limit in production;
    this guard prevents accidental bursts on a single application process.
    """

    def __init__(self, limit: int = 5, window_seconds: int = 15 * 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        threshold = now - self.window_seconds
        with self._lock:
            timestamps = self._requests[key]
            while timestamps and timestamps[0] <= threshold:
                timestamps.popleft()
            if len(timestamps) >= self.limit:
                raise HTTPException(429, "Trop de tentatives. Réessayez dans quelques minutes.")
            timestamps.append(now)


public_auth_rate_limiter = PublicAuthRateLimiter()
