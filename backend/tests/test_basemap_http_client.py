import asyncio

import httpx
import pytest

from app.basemaps import http_client


pytestmark = pytest.mark.unit


def test_shared_basemap_client_reads_tiles_and_content_type(monkeypatch) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, headers={"content-type": "image/png; charset=binary"}, content=b"tile")

    async def scenario() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        monkeypatch.setattr(http_client, "_client", client)
        try:
            first = await http_client.fetch_basemap_tile("https://tiles.example/1", headers={}, timeout=1)
            second = await http_client.fetch_basemap_tile("https://tiles.example/2", headers={}, timeout=1)
        finally:
            await client.aclose()
            monkeypatch.setattr(http_client, "_client", None)
        assert first == (b"tile", "image/png")
        assert second == (b"tile", "image/png")

    asyncio.run(scenario())
    assert calls == 2


def test_basemap_client_reports_provider_status(monkeypatch) -> None:
    async def scenario() -> None:
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: httpx.Response(403)))
        monkeypatch.setattr(http_client, "_client", client)
        try:
            with pytest.raises(http_client.BasemapUpstreamStatusError) as raised:
                await http_client.fetch_basemap_tile("https://tiles.example/denied", headers={}, timeout=1)
        finally:
            await client.aclose()
            monkeypatch.setattr(http_client, "_client", None)
        assert raised.value.status_code == 403

    asyncio.run(scenario())
