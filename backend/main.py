from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from database import engine

app = FastAPI(
    title="POI Manager API",
    description="API for managing geographic points of interest",
    version="0.1.0",
)


@app.get("/")
def root():
    return {"message": "POI Manager API is running"}


@app.get("/places")
def get_places():
    query = text(
        """
        SELECT
            id,
            name,
            description,
            address,
            country,
            region,
            ST_X(location) AS longitude,
            ST_Y(location) AS latitude,
            created_at,
            updated_at
        FROM places
        ORDER BY created_at DESC
        """
    )

    try:
        with engine.connect() as connection:
            result = connection.execute(query)
            return [dict(row._mapping) for row in result]

    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve places from the database",
        ) from error