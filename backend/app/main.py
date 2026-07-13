import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.categories.router import router as categories_router
from app.countries.router import router as countries_router
from app.maps.router import router as maps_router
from app.photos.router import router as photos_router
from app.places.map_router import router as places_map_router
from app.places.router import router as places_router
from app.tags.router import router as tags_router
from app.statuses.router import router as statuses_router


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

app = FastAPI(
    title="POI Manager API",
    description="API for managing geographic points of interest",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)

app.include_router(places_map_router)
app.include_router(places_router)
app.include_router(categories_router)
app.include_router(countries_router)
app.include_router(maps_router)
app.include_router(tags_router)
app.include_router(statuses_router)
app.include_router(photos_router)


@app.get(
    "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "POI Manager API is running"}
