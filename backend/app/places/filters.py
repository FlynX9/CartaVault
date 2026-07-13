from dataclasses import dataclass

from fastapi import HTTPException, Query, status


@dataclass(frozen=True)
class MapBounds:
    """Geographic bounds of a visible map area."""

    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float


def validate_map_bounds(
    min_latitude: float | None,
    max_latitude: float | None,
    min_longitude: float | None,
    max_longitude: float | None,
    *,
    required: bool,
) -> MapBounds | None:
    """Validate geographic bounds and return a structured value."""

    supplied_values = (
        min_latitude,
        max_latitude,
        min_longitude,
        max_longitude,
    )

    if all(value is None for value in supplied_values):
        if required:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "All four map bounds are required: "
                    "min_latitude, max_latitude, "
                    "min_longitude and max_longitude"
                ),
            )

        return None

    if any(value is None for value in supplied_values):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "All four map bounds must be provided together: "
                "min_latitude, max_latitude, "
                "min_longitude and max_longitude"
            ),
        )

    assert min_latitude is not None
    assert max_latitude is not None
    assert min_longitude is not None
    assert max_longitude is not None

    if min_latitude >= max_latitude:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_latitude must be lower than max_latitude",
        )

    if min_longitude >= max_longitude:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_longitude must be lower than max_longitude",
        )

    return MapBounds(
        min_latitude=min_latitude,
        max_latitude=max_latitude,
        min_longitude=min_longitude,
        max_longitude=max_longitude,
    )


def get_map_bounds(
    min_latitude: float | None = Query(
        default=None,
        ge=-90,
        le=90,
        description="Southern latitude of the visible map area",
    ),
    max_latitude: float | None = Query(
        default=None,
        ge=-90,
        le=90,
        description="Northern latitude of the visible map area",
    ),
    min_longitude: float | None = Query(
        default=None,
        ge=-180,
        le=180,
        description="Western longitude of the visible map area",
    ),
    max_longitude: float | None = Query(
        default=None,
        ge=-180,
        le=180,
        description="Eastern longitude of the visible map area",
    ),
) -> MapBounds | None:
    """Return optional geographic bounds for general place searches."""

    return validate_map_bounds(
        min_latitude=min_latitude,
        max_latitude=max_latitude,
        min_longitude=min_longitude,
        max_longitude=max_longitude,
        required=False,
    )


def get_required_map_bounds(
    min_latitude: float = Query(
        default=...,
        ge=-90,
        le=90,
        description="Southern latitude of the visible map area",
    ),
    max_latitude: float = Query(
        default=...,
        ge=-90,
        le=90,
        description="Northern latitude of the visible map area",
    ),
    min_longitude: float = Query(
        default=...,
        ge=-180,
        le=180,
        description="Western longitude of the visible map area",
    ),
    max_longitude: float = Query(
        default=...,
        ge=-180,
        le=180,
        description="Eastern longitude of the visible map area",
    ),
) -> MapBounds:
    """Return mandatory geographic bounds for map marker requests."""

    map_bounds = validate_map_bounds(
        min_latitude=min_latitude,
        max_latitude=max_latitude,
        min_longitude=min_longitude,
        max_longitude=max_longitude,
        required=True,
    )

    assert map_bounds is not None

    return map_bounds
