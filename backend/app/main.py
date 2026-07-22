import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.auth.admin_router import router as admin_users_router
from app.admin.router import router as admin_console_router
from app.auth.account_router import router as account_router
from app.auth.credential_router import router as credential_router
from app.auth.dependencies import require_csrf
from app.auth.models import User
from app.auth.router import router as auth_router
from app.auth.public_router import router as public_auth_router
from app.auth.registration_admin_router import router as registration_admin_router
from app.categories.router import router as categories_router
from app.countries.router import router as countries_router
from app.database import SessionLocal
from app.exports.router import router as exports_router
from app.imports.router import router as imports_router
from app.instance_status.router import router as instance_status_router
from app.maps.invitation_router import router as invitations_router
from app.maps.models import PoiMap
from app.maps.router import router as maps_router
from app.photos.router import router as photos_router
from app.quotas.router import router as quotas_router
from app.places.map_router import router as places_map_router
from app.places.advanced_router import router as places_advanced_router
from app.places.router import router as places_router
from app.statuses.router import router as statuses_router
from app.tags.router import router as tags_router
from app.trips.router import router as trips_router
from app.config import legacy_google_routes_api_key_configured


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

    return [
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    ]


load_dotenv()


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
    if active_admins == 0:
        raise RuntimeError("No active CartaVault administrator exists. Run: python -m app.cli create-admin")
    if orphan_maps:
        raise RuntimeError("CartaVault has orphan maps. Run the administrator bootstrap/backfill before starting the application")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if legacy_google_routes_api_key_configured:
        logger.warning("GOOGLE_MAPS_ROUTES_API_KEY is deprecated and is not used for user routing")
    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            with SessionLocal() as session:
                validate_startup_security_state(session)
        except SQLAlchemyError as error:
            raise RuntimeError("CartaVault authentication schema is missing. Apply the schema migration, then run: python -m app.cli create-admin") from error
    yield

app = FastAPI(
    title="CartaVault API",
    description="API for managing geographic points of interest",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(require_csrf)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
)

app.include_router(auth_router)
app.include_router(public_auth_router)
app.include_router(account_router)
app.include_router(credential_router)
app.include_router(invitations_router)
app.include_router(admin_users_router)
app.include_router(registration_admin_router)
app.include_router(admin_console_router)
app.include_router(quotas_router)
app.include_router(instance_status_router)
app.include_router(places_map_router)
app.include_router(places_advanced_router)
app.include_router(places_router)
app.include_router(categories_router)
app.include_router(countries_router)
app.include_router(maps_router)
app.include_router(imports_router)
app.include_router(exports_router)
app.include_router(tags_router)
app.include_router(statuses_router)
app.include_router(photos_router)
app.include_router(trips_router)


@app.get(
    "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "CartaVault API is running"}
