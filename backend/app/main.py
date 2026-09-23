import asyncio
import os
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from contextlib import suppress
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

# Infrastructure settings must be available before importing modules that
# instantiate their configuration objects at import time.
load_dotenv()

import app.models  # noqa: F401
from app.auth.admin_router import router as admin_users_router
from app.admin.router import router as admin_console_router
from app.auth.account_router import router as account_router
from app.auth.google_places_credential_router import router as google_places_credential_router
from app.auth.api_key_router import router as api_key_router
from app.places.stadia_credential_router import router as stadia_places_credential_router
from app.basemaps.router import admin_router as basemap_admin_router, router as basemap_router
from app.basemaps.arcgis_router import router as arcgis_basemap_router
from app.basemaps.vector_router import admin_router as vector_basemap_admin_router, router as vector_basemap_router
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
from app.database import SessionLocal, database_url, engine, get_db, readiness_engine
from app.exports.router import router as exports_router
from app.imports.router import router as imports_router
from app.instance_status.router import router as instance_status_router
from app.instance_status.logs import install_instance_log_handler, record_instance_log
from app.maps.invitation_router import router as invitations_router
from app.maps.models import PoiMap
from app.maps.router import router as maps_router
from app.map_profiles.router import router as map_profiles_router
from app.maintenance_leader import MaintenanceGenerationLost, MaintenanceLeaderSupervisor
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
from app.privacy.router import admin_router as privacy_admin_router, account_router as privacy_account_router, router as privacy_router
from app.security_headers import SecurityHeadersMiddleware
from app.tags.router import router as tags_router
from app.trips.router import router as trips_router
from app.trips.optimization_store import optimization_proposal_store
from app.tasks.router import router as tasks_router
from app.tasks.cleanup import purge_expired_task_artifacts
from app.privacy.settings import get_privacy_settings
from app.privacy.service import purge_expired_privacy_artifacts
from app.config import database_settings, legacy_google_routes_api_key_configured, maintenance_leader_settings, storage_reconciliation_settings, task_settings
from app.photos.reconciliation import run_fast_reconciliation_cycle
from app.tasks.recovery import dispatcher_for_current_mode, run_recovery_cycle
from app.trash.router import router as trash_router
from app.trash.service import purge_expired_trash
from app.static_frontend import install_frontend, normalize_api_prefix
from app.basemaps.vector_service import recover_vector_basemap_jobs, schedule_due_updates, start_pending_vector_basemap_jobs


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
_readiness_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="cartavault-readiness")
_readiness_timeout_seconds = min(2, max(1, database_settings.connect_timeout_seconds))


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


async def _trash_purge_loop(
    supervisor: MaintenanceLeaderSupervisor,
    generation: int,
    before_commit,
) -> None:
    while True:
        await asyncio.sleep(maintenance_leader_settings.purge_interval_seconds)
        try:
            await supervisor.run_leader_operation(
                generation,
                lambda: _purge_expired_maintenance(before_commit=before_commit),
            )
        except MaintenanceGenerationLost:
            return
        except SQLAlchemyError:
            logger.exception("Unable to purge expired trash items")


async def _vector_basemap_maintenance_loop(
    supervisor: MaintenanceLeaderSupervisor,
    generation: int,
    before_commit,
) -> None:
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await supervisor.run_leader_operation(
                generation,
                lambda: _schedule_due_vector_updates(before_commit=before_commit),
            )
        except MaintenanceGenerationLost:
            return
        except SQLAlchemyError:
            logger.exception("Unable to schedule CartaVault basemap updates")


async def _task_recovery_loop() -> None:
    # Runs one cycle immediately after startup (crash recovery) and then
    # periodically so a task orphaned while this process stays alive is still
    # reclaimed within a bounded delay.
    while True:
        try:
            await asyncio.to_thread(_run_task_recovery_cycle)
        except SQLAlchemyError:
            logger.exception("Unable to run task recovery cycle")
        except Exception:
            logger.exception("Task recovery cycle interrupted")
        await asyncio.sleep(task_settings.recovery_interval_seconds)


def _run_task_recovery_cycle() -> None:
    with SessionLocal() as session:
        run_recovery_cycle(session, dispatcher_for_current_mode())


async def _storage_reconciliation_loop() -> None:
    # Every API process participates. Database SKIP LOCKED claims make this
    # safe without coupling storage recovery to maintenance leadership.
    while True:
        try:
            await asyncio.to_thread(run_fast_reconciliation_cycle)
        except SQLAlchemyError:
            logger.exception("Unable to run storage reconciliation cycle")
        except Exception:
            logger.exception("Storage reconciliation cycle interrupted")
        await asyncio.sleep(storage_reconciliation_settings.interval_seconds)


def _start_leader_maintenance(*, before_commit=None) -> list:
    """Run the leader-only recovery pass before periodic jobs are started."""

    with SessionLocal() as session:
        purge_expired_trash(session, before_commit=before_commit)
        purge_expired_task_artifacts(session, before_commit=before_commit)
        purge_expired_privacy_artifacts(session, get_privacy_settings(session), before_commit)
        optimization_proposal_store.purge_expired(session, before_commit)
        pending_vector_jobs = recover_vector_basemap_jobs(session, before_commit=before_commit)
        pending_vector_jobs.extend(schedule_due_updates(session, before_commit=before_commit))
    return pending_vector_jobs


def _purge_expired_trash() -> None:
    with SessionLocal() as session:
        purge_expired_trash(session)


def _schedule_due_vector_updates(*, before_commit=None) -> list:
    with SessionLocal() as session:
        return schedule_due_updates(session, before_commit=before_commit)


def _purge_expired_maintenance(*, before_commit=None) -> None:
    with SessionLocal() as session:
        trash_result = purge_expired_trash(session, before_commit=before_commit)
        task_result = purge_expired_task_artifacts(session, before_commit=before_commit)
        privacy_result = purge_expired_privacy_artifacts(session, get_privacy_settings(session), before_commit)
        optimization_proposal_store.purge_expired(session, before_commit)
    logger.info(
        "maintenance_job_completed job=periodic_purge instance=%s trash=%s tasks=%s privacy=%s",
        os.getenv("CARTAVAULT_INSTANCE_ID", "unknown"),
        trash_result,
        task_result,
        privacy_result,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Logging can be reconfigured by the ASGI server after module import.
    # Re-attach the bounded, sanitized administrative log collector at startup.
    install_instance_log_handler()
    record_instance_log(logging.INFO, "app.instance", "CartaVault instance log collector started")
    task_recovery_task: asyncio.Task[None] | None = None
    storage_reconciliation_task: asyncio.Task[None] | None = None
    maintenance_supervisor_task: asyncio.Task[None] | None = None
    leader_purge_task: asyncio.Task[None] | None = None
    leader_vector_task: asyncio.Task[None] | None = None
    if legacy_google_routes_api_key_configured:
        logger.warning("GOOGLE_MAPS_ROUTES_API_KEY is deprecated and is not used for user routing")
    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            with SessionLocal() as session:
                validate_startup_security_state(session)
        except SQLAlchemyError as error:
            raise RuntimeError("CartaVault authentication schema is missing. Apply the schema migration, then run: python -m app.cli create-admin") from error

        async def become_leader() -> None:
            nonlocal leader_purge_task, leader_vector_task
            if leader_purge_task is not None or leader_vector_task is not None:
                return
            generation = maintenance_supervisor.generation
            if generation is None:
                raise MaintenanceGenerationLost()

            def before_commit() -> None:
                if not maintenance_supervisor.is_current_generation(generation):
                    raise MaintenanceGenerationLost()

            pending_vector_jobs = await maintenance_supervisor.run_leader_operation(
                generation,
                lambda: _start_leader_maintenance(before_commit=before_commit),
            )
            leader_purge_task = asyncio.create_task(
                _trash_purge_loop(maintenance_supervisor, generation, before_commit)
            )
            leader_vector_task = asyncio.create_task(
                _vector_basemap_maintenance_loop(maintenance_supervisor, generation, before_commit)
            )
            before_commit()
            start_pending_vector_basemap_jobs(pending_vector_jobs)
            logger.info("maintenance_leader_jobs_started")

        async def lose_leader() -> None:
            nonlocal leader_purge_task, leader_vector_task
            tasks = [task for task in (leader_purge_task, leader_vector_task) if task is not None]
            leader_purge_task = None
            leader_vector_task = None
            for task in tasks:
                task.cancel()
            for task in tasks:
                with suppress(asyncio.CancelledError):
                    await task
            if tasks:
                logger.info("maintenance_leader_jobs_stopped")

        maintenance_supervisor = MaintenanceLeaderSupervisor(
            engine,
            check_interval_seconds=maintenance_leader_settings.check_interval_seconds,
            reconnect_initial_seconds=maintenance_leader_settings.reconnect_initial_seconds,
            reconnect_max_seconds=maintenance_leader_settings.reconnect_max_seconds,
            reconnect_jitter_seconds=maintenance_leader_settings.reconnect_jitter_seconds,
        )
        maintenance_supervisor_task = asyncio.create_task(
            maintenance_supervisor.run(become_leader, lose_leader),
            name="maintenance-leader-supervisor",
        )
        # In sync mode background work runs in-process, so this process is the
        # only executor and must also own crash recovery. In Redis mode the
        # worker process runs the recovery supervisor instead.
        if task_settings.mode == "sync":
            task_recovery_task = asyncio.create_task(_task_recovery_loop())
        storage_reconciliation_task = asyncio.create_task(_storage_reconciliation_loop())
    try:
        yield
    finally:
        if maintenance_supervisor_task is not None:
            maintenance_supervisor.stop()
            with suppress(asyncio.CancelledError):
                await maintenance_supervisor_task
        if task_recovery_task is not None:
            task_recovery_task.cancel()
            with suppress(asyncio.CancelledError):
                await task_recovery_task
        if storage_reconciliation_task is not None:
            storage_reconciliation_task.cancel()
            with suppress(asyncio.CancelledError):
                await storage_reconciliation_task

app = FastAPI(
    title="CartaVault API",
    description="API for managing geographic points of interest",
    version=os.getenv("CARTAVAULT_VERSION", "development"),
    root_path=os.getenv("CARTAVAULT_API_ROOT_PATH", "").strip().rstrip("/"),
    docs_url=None,
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
        "Range",
        "X-CSRF-Token",
        "X-CartaVault-Setup-Token",
    ],
    expose_headers=["Accept-Ranges", "Content-Length", "Content-Range", "ETag", "X-CSRF-Token"],
)
app.add_middleware(SecurityHeadersMiddleware)


@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> Response:
    """Serve Swagger with the browser-facing API prefix preserved."""

    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title=f"{app.title} - Swagger UI",
        oauth2_redirect_url="/api/docs/oauth2-redirect",
    )

app.include_router(setup_router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(totp_router, prefix=API_PREFIX)
app.include_router(email_mfa_router, prefix=API_PREFIX)
app.include_router(public_auth_router, prefix=API_PREFIX)
app.include_router(account_router, prefix=API_PREFIX)
app.include_router(api_key_router, prefix=API_PREFIX)
app.include_router(google_places_credential_router, prefix=API_PREFIX)
app.include_router(basemap_router, prefix=API_PREFIX)
app.include_router(arcgis_basemap_router, prefix=API_PREFIX)
app.include_router(vector_basemap_router, prefix=API_PREFIX)
app.include_router(vector_basemap_admin_router, prefix=API_PREFIX)
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
app.include_router(map_profiles_router, prefix=API_PREFIX)
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
app.include_router(privacy_router, prefix=API_PREFIX)
app.include_router(privacy_account_router, prefix=API_PREFIX)
app.include_router(privacy_admin_router, prefix=API_PREFIX)
app.include_router(trash_router, prefix=API_PREFIX)


@app.get(
    f"{API_PREFIX}/" if API_PREFIX else "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "CartaVault API is running"}


@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


def _probe_readiness_database() -> None:
    with readiness_engine.connect() as connection:
        connection.execute(text("SELECT 1"))


async def _probe_readiness_socket() -> None:
    database = make_url(database_url)
    if database.host is None:
        return
    _, writer = await asyncio.wait_for(
        asyncio.open_connection(database.host, database.port or 5432),
        timeout=_readiness_timeout_seconds,
    )
    writer.close()


@app.get("/health/ready", include_in_schema=False)
async def readiness(response: Response) -> dict[str, str]:
    """Return a deliberately minimal readiness signal without diagnostic details."""

    try:
        await _probe_readiness_socket()
        probe = asyncio.get_running_loop().run_in_executor(
            _readiness_executor,
            _probe_readiness_database,
        )
        await asyncio.wait_for(probe, timeout=_readiness_timeout_seconds)
    except (SQLAlchemyError, OSError, TimeoutError):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}
    return {"status": "ready"}


if FRONTEND_DIST:
    install_frontend(app, directory=Path(FRONTEND_DIST), api_prefix=API_PREFIX)
