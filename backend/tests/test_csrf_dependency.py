from __future__ import annotations

import pytest
from fastapi import HTTPException, Request

from app.auth.dependencies import require_csrf


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [(b"cookie", b"cartavault_session=expired; cartavault_csrf=expired")],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


@pytest.mark.parametrize("path", ["/auth/login", "/api/auth/login", "/nested/api/auth/login/"])
def test_login_ignores_stale_session_cookies_with_any_api_prefix(path: str) -> None:
    require_csrf(_request(path), database_session=object())


def test_other_mutating_auth_routes_remain_csrf_protected() -> None:
    with pytest.raises(HTTPException, match="Invalid CSRF token") as error:
        require_csrf(_request("/api/auth/logout"), database_session=object())
    assert error.value.status_code == 403
