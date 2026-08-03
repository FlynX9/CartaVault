"""Browser security headers shared by API and same-origin frontend responses."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


SECURITY_HEADERS = {
    "content-security-policy": "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
    "permissions-policy": "camera=(), microphone=(), payment=(), usb=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
}


class SecurityHeadersMiddleware:
    """Attach conservative headers without overriding stricter route values."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    if name not in headers:
                        headers[name] = value
                if scope.get("scheme") == "https" and "strict-transport-security" not in headers:
                    headers["strict-transport-security"] = "max-age=31536000"
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
