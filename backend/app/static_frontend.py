"""Serve the compiled CartaVault frontend from the FastAPI process."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles


class ImmutableStaticFiles(StaticFiles):
    """Add long-lived caching to Vite's content-hashed assets."""

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


def normalize_api_prefix(value: str | None) -> str:
    if not value:
        return ""
    normalized = f"/{value.strip().strip('/')}"
    return "" if normalized == "/" else normalized


def install_frontend(
    app: FastAPI,
    *,
    directory: str | Path,
    api_prefix: str,
) -> None:
    """Install static assets and the React deep-link fallback when available."""

    frontend_root = Path(directory).resolve()
    index_file = frontend_root / "index.html"
    assets_directory = frontend_root / "assets"
    if not index_file.is_file() or not assets_directory.is_dir():
        raise RuntimeError(
            f"Compiled CartaVault frontend is missing from {frontend_root}."
        )

    app.mount(
        "/assets",
        ImmutableStaticFiles(directory=assets_directory, check_dir=True),
        name="frontend-assets",
    )
    guarded_api_path = api_prefix.lstrip("/")

    @app.get("/{frontend_path:path}", include_in_schema=False)
    async def serve_frontend(frontend_path: str):
        if guarded_api_path and (
            frontend_path == guarded_api_path
            or frontend_path.startswith(f"{guarded_api_path}/")
        ):
            raise HTTPException(status_code=404, detail="Not Found")

        requested_file = (frontend_root / frontend_path).resolve()
        requested_index = requested_file / "index.html"
        if requested_file.is_relative_to(frontend_root) and requested_index.is_file():
            return FileResponse(
                requested_index,
                headers={"Cache-Control": "public, max-age=3600"},
            )
        if requested_file.is_relative_to(frontend_root) and requested_file.is_file():
            return FileResponse(
                requested_file,
                headers={"Cache-Control": "public, max-age=3600"},
            )

        return FileResponse(
            index_file,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
