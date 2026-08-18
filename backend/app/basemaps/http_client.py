"""Shared asynchronous HTTP client for proxied basemap tiles."""

from __future__ import annotations

import httpx


MAX_TILE_BYTES = 8 * 1024 * 1024
_client: httpx.AsyncClient | None = None


class BasemapUpstreamStatusError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"Basemap upstream returned HTTP {status_code}")
        self.status_code = status_code


class BasemapUpstreamUnavailable(Exception):
    pass


async def start_basemap_http_client() -> None:
    """Create one bounded connection pool per application worker."""

    global _client
    if _client is not None:
        await _client.aclose()
    _client = httpx.AsyncClient(
        follow_redirects=False,
        limits=httpx.Limits(max_connections=24, max_keepalive_connections=12, keepalive_expiry=30),
    )


async def close_basemap_http_client() -> None:
    global _client
    client, _client = _client, None
    if client is not None:
        await client.aclose()


async def fetch_basemap_tile(url: str, *, headers: dict[str, str], timeout: float) -> tuple[bytes, str]:
    """Download one bounded tile without occupying FastAPI's worker threads."""

    client = _client
    owns_client = client is None
    if client is None:
        # Keeps direct unit calls deterministic; production initializes the
        # shared client from the application lifespan.
        client = httpx.AsyncClient(follow_redirects=False)
    try:
        try:
            async with client.stream("GET", url, headers=headers, timeout=timeout) as response:
                if response.status_code >= 400:
                    raise BasemapUpstreamStatusError(response.status_code)
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_TILE_BYTES:
                        raise BasemapUpstreamUnavailable("Basemap tile exceeds the size limit")
                content_type = response.headers.get("content-type", "application/octet-stream").split(";", 1)[0]
                return bytes(content), content_type
        except BasemapUpstreamStatusError:
            raise
        except (httpx.RequestError, httpx.StreamError, TimeoutError, OSError) as error:
            raise BasemapUpstreamUnavailable("Basemap upstream is unavailable") from error
    finally:
        if owns_client:
            await client.aclose()
