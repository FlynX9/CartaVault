from fastapi import FastAPI

from app.places.router import router as places_router

app = FastAPI(
    title="POI Manager API",
    description="API for managing geographic points of interest",
    version="0.1.0",
)

app.include_router(places_router)


@app.get(
    "/",
    tags=["health"],
)
def root() -> dict[str, str]:
    return {"message": "POI Manager API is running"}