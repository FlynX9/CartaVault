import asyncio
import os
import logging
from contextlib import asynccontextmanager
from contextlib import suppress
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.auth.admin_router import router as admin_users_router
from app.admin.router import router as admin_console_router
from app.auth.account_router import router as account_router
from app.auth.credential_router import router as credential_router
from app.auth.google_places_credential_router import router as google_places_credential_router
from app.places.stadia_credential_router import router as stadia_places_credential_router
from app.auth.openrouteservice_credential_router import router as openrouteservice_credential_router
from app.basemaps.router import admin_router as basemap_admin_router, credential_router as basemap_credential_router, router as basemap_router
from app.basemaps.stadia_router import router as stadia_basemap_router
from app.auth.dependencies import require_csrf
from app.auth.models import User
from app.auth.router import router as auth_router
from app.auth.totp_router import router as totp_router
from app.auth.email_mfa_router import router as email_mfa_router
from app.auth.public_router import router as public_auth_router
from app.auth.registration_admin_router import router as registration_admin_router
from app.categories.router import router as categories_router
from app.annotations.router import router as annotations_router
from app.countries.router import router as countries_router
from app.dashboard.router import router as dashboard_router
from app.database import SessionLocal, get_db
from app.exports.router import router as exports_router
from app.imports.router import router as imports_router
from app.instance_status.router import router as instance_status_router
from app.instance_status.logs import install_instance_log_handler
from app.maps.invitation_router import router as invitations_router
from app.maps.models import PoiMap
from app.maps.router import router as maps_router
from app.media.router import router as media_router, upload_router as media_upload_router
from app.photos.router import router as photos_router
from app.quotas.router import router as quotas_router
from app.places.map_router import router as places_map_router
from app.places.advanced_router import router as places_advanced_router
from app.places.router import router as places_router
from app.statuses.router import router as statuses_router
from app.setup.router import router as setup_router
from app.setup.service import setup_token
from app.saas.router import admin_router as saas_admin_router, router as saas_router
from app.security_headers import SecurityHeadersMiddleware
from app.tags.router import router as tags_router
from app.trips.router import router as trips_router
from app.tasks.router import router as tasks_router
from app.tasks.cleanup import purge_expired_task_artifacts
from app.config import legacy_google_routes_api_key_configured
from app.trash.router import router as trash_router
from app.trash.service import purge_expired_trash
from app.static_frontend import install_frontend, normalize_api_prefix


logger = logging.getLogger(__name__)


DEFAULT_CORS_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def get_cors_allowed_origins() -> list[str]:
    """Return normalized, explicitly configured browser origins."""

    configured_origins = os.getenv("CORS_ALLOWED_ORIGINS")

    if configured_origins is None:
        return list(DEFAULT_CORS_ALLOWED_ORIGINS)

    origins: list[str] = []
    for configured_origin in configured_origins.split(","):
        origin = configured_origin.strip().rstrip("/")
        if not origin:
            continue
        try:
            parsed = urlsplit(origin)
            parsed.port
        except ValueError as error:
            raise RuntimeError(f"Invalid CORS origin: {origin}") from error
        if (
            origin == "*"
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError(f"Invalid CORS origin: {origin}")
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        if normalized not in origins:
            origins.append(normalized)
    return origins


load_dotenv()

API_PREFIX = normalize_api_prefix(os.getenv("CARTAVAULT_API_PREFIX"))
FRONTEND_DIST = os.getenv("CARTAVAULT_FRONTEND_DIST")


def validate_startup_security_state(session: Session) -> None:
    active_admins = session.scalar(
        select(func.count()).select_from(User).where(
            User.is_admin.is_(True),
            User.is_active.is_(True),
        )
    ) or 0
    orphan_maps = session.scalar(
        select(func.count()).select_from(PoiMap).where(PoiMap.owner_id.is_(None))
    ) or 0
    if active_admins == 0 and not setup_token():
        raise RuntimeError("No active CartaVault administrator exists. Run: python -m app.cli create-admin")
    if active_admins == 0 and orphan_maps:
        raise RuntimeError(
            "CartaVault has legacy maps but no active administrator. "
            "Run the administrator bootstrap/backfill before starting the application"
        )
    if orphan_maps:
        raise RuntimeError("CartaVault has orphan maps. Run the administrator bootstrap/backfill before starting the application")


async def _trash_purge_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            await asyncio.to_thread(_purge_expired_maintenance)
        except SQLAlchemyError:
            logger.exception("Unable to purge expired trash items")


def _purge_expired_trash() -> None:
    with SessionLocal() as session:
        purge_expired_trash(session)


def _purge_expired_maintenance() -> None:
    with SessionLocal() as session:
        purge_expired_trash(session)
        purge_expired_task_artifacts(session)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Logging can be reconfigured by the ASGI server after module import.
    # Re-attach the bounded, sanitized administrative log collector at startup.
    install_instance_log_handler()
    purge_task: asyncio.Task[None] | None = None
    if legacy_google_routes_api_key_configured:
        logger.warning("GOOGLE_MAPS_ROUTES_API_KEY is deprecated and is not used for user routing")
    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            with SessionLocal() as session:
                validate_startup_security_state(session)
                purge_expired_trash(session)
                purge_expired_task_artifacts(session)
        except SQLAlchemyError as error:
            raise RuntimeError("CartaVault authentication schema is missing. Apply the schema migration, then run: python -m app.cli create-admin") from error
        purge_task = asyncio.create_task(_trash_purge_loop())
    try:
        yield
    finally:
        if purge_task is not None:
            purge_task.cancel()
            with suppress(asyncio.CancelledError):
                await purge_task

app = FastAPI(
    title="CartaVault API",
    description="API for managing geographic points of interest",
    version="0.1.0",
    root_path=os.getenv("CARTAVAULT_API_ROOT_PATH", "").strip().rstrip("/"),
    docs_url=f"{API_PREFIX}/docs",
    openapi_url=f"{API_PREFIX}/openapi.json",
    redoc_url=f"{API_PREFIX}/redoc",
    swagger_ui_oauth2_redirect_url=f"{API_PREFIX}/docs/oauth2-redirect",
    lifespan=lifespan,
    dependencies=[Depends(require_csrf)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Content-Type",
        "X-CSRF-Token",
        "X-CartaVault-Setup-Token",
    ],
)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(setup_router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(totp_router, prefix=API_PREFIX)
app.include_router(email_mfa_router, prefix=API_PREFIX)
app.include_router(public_auth_router, prefix=API_PREFIX)
app.include_router(account_router, prefix=API_PREFIX)
app.include_router(credential_router, prefix=API_PREFIX)
app.include_router(google_places_credential_router, prefix=API_PREFIX)
app.include_router(openrouteservice_credential_router, prefix=API_PREFIX)
app.include_router(basemap_credential_router, prefix=API_PREFIX)
app.include_router(basemap_router, prefix=API_PREFIX)
app.include_router(stadia_basemap_router, prefix=API_PREFIX)
app.include_router(stadia_places_credential_router, prefix=API_PREFIX)
app.include_router(invitations_router, prefix=API_PREFIX)
app.include_router(admin_users_router, prefix=API_PREFIX)
app.include_router(registration_admin_router, prefix=API_PREFIX)
app.include_router(admin_console_router, prefix=API_PREFIX)
app.include_router(basemap_admin_router, prefix=API_PREFIX)
app.include_router(quotas_router, prefix=API_PREFIX)
app.include_router(instance_status_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(places_map_router, prefix=API_PREFIX)
app.include_router(places_advanced_router, prefix=API_PREFIX)
app.include_router(places_router, prefix=API_PREFIX)
app.include_router(categories_router, prefix=API_PREFIX)
app.include_router(annotations_router, prefix=API_PREFIX)
app.include_router(countries_router, prefix=API_PREFIX)
app.include_router(maps_router, prefix=API_PREFIX)
app.include_router(imports_router, prefix=API_PREFIX)
app.include_router(exports_router, prefix=API_PREFIX)
app.include_router(tags_router, prefix=API_PREFIX)
app.include_router(statuses_router, prefix=API_PREFIX)
app.include_router(photos_router, prefix=API_PREFIX)
app.include_router(media_router, prefix=API_PREFIX)
app.include_router(media_upload_router, prefix=API_PREFIX)
app.include_router(trips_router, prefix=API_PREFIX)
app.include_router(tasks_router, prefix=API_PREFIX)
app.include_router(saas_router, prefix=API_PREFIX)
app.include_router(saas_admin_router, prefix=API_PREFIX)
app.include_router(trash_router, prefix=API_PREFIX)


@app.get(
    f"{API_PREFIX}/" if API_PREFIX else "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "CartaVault API is running"}


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", include_in_schema=False)
def readiness(response: Response, session: Session = Depends(get_db)) -> dict[str, str]:
    """Return a deliberately minimal readiness signal without diagnostic details."""

    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        session.rollback()
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}
    return {"status": "ready"}


if FRONTEND_DIST:
    install_frontend(app, directory=Path(FRONTEND_DIST), api_prefix=API_PREFIX)
