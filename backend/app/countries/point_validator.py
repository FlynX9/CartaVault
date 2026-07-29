"""Country compatibility checks for point coordinates.

The embedded boundary catalogue uses ISO alpha-3 geometries. Multi-polygons
are evaluated in full, so overseas regions included in a country's geometry
are accepted. Separate dependencies and disputed territories follow the ISO
geometry they are assigned to in the catalogue. A warning can always be
confirmed to accommodate border data inaccuracies and exceptional cases.
"""

from dataclasses import dataclass
from typing import Literal

from app.config import routing_settings
from app.trips.routing.country_validator import (
    _distance_to_polygons_meters,
    _inside_any,
    load_boundaries,
)


PointCountryStatus = Literal["inside", "border_tolerance", "outside", "boundary_unavailable"]


@dataclass(frozen=True)
class PointCountryValidation:
    status: PointCountryStatus
    country_code: str
    tolerance_meters: int

    @property
    def requires_confirmation(self) -> bool:
        return self.status == "outside"


def validate_point_country(
    latitude: float,
    longitude: float,
    country_code: str,
    *,
    tolerance_meters: int | None = None,
) -> PointCountryValidation:
    """Classify one point against all territories represented for a country."""

    code = country_code.upper()
    tolerance = (
        routing_settings.country_boundary_tolerance_meters
        if tolerance_meters is None
        else tolerance_meters
    )
    polygons = load_boundaries().get(code)
    if not polygons:
        return PointCountryValidation("boundary_unavailable", code, tolerance)

    point = [longitude, latitude]
    if _inside_any(point, polygons):
        return PointCountryValidation("inside", code, tolerance)
    if _distance_to_polygons_meters(point, polygons) <= tolerance:
        return PointCountryValidation("border_tolerance", code, tolerance)
    return PointCountryValidation("outside", code, tolerance)
