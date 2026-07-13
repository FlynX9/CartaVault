from fastapi import FastAPI

from app.categories.router import router as categories_router
from app.places.map_router import router as places_map_router
from app.places.router import router as places_router
from app.tags.router import router as tags_router


app = FastAPI(
    title="POI Manager API",
    description="API for managing geographic points of interest",
    version="0.1.0",
)

app.include_router(places_map_router)
app.include_router(places_router)
app.include_router(categories_router)
app.include_router(tags_router)


@app.get(
    "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "POI Manager API is running"}
