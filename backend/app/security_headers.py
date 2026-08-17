"""Browser security headers shared by API and same-origin frontend responses."""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


SECURITY_HEADERS = {
    "content-security-policy": (
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; "
        "script-src 'self' 'wasm-unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; "
        "font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https:; worker-src 'self' blob:; manifest-src 'self'"
    ),
    "permissions-policy": "camera=(), microphone=(), payment=(), usb=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
}

# FastAPI's built-in documentation HTML loads Swagger UI/ReDoc from jsDelivr
# and bootstraps each viewer with a small inline script. Keep the application
# policy strict and grant this compatibility exception only to documentation
# pages (including deployments using an API prefix).
DOCUMENTATION_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: blob: https:; font-src 'self' data: https://cdn.jsdelivr.net; "
    "connect-src 'self' https:; worker-src 'self' blob:; manifest-src 'self'"
)


def _is_documentation_page(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return (
        normalized.endswith("/docs")
        or normalized.endswith("/redoc")
        or normalized.startswith("/docs/")
        or normalized.startswith("/pagefind/")
    )


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
                if _is_documentation_page(scope.get("path", "")):
                    headers["content-security-policy"] = DOCUMENTATION_CONTENT_SECURITY_POLICY
                if scope.get("scheme") == "https" and "strict-transport-security" not in headers:
                    headers["strict-transport-security"] = "max-age=31536000"
            await send(message)

        await self.app(scope, receive, send_with_security_headers)
