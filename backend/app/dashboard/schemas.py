from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    places: int
    maps: int
    countries: int
    trips: int
    visited_places: int
    unvisited_places: int
    favorites: int
    media: int
    places_without_photos: int
    planned_trips: int
    completed_trips: int


class DashboardStatusItem(BaseModel):
    id: UUID | None = None
    name: str
    color: str
    count: int


class DashboardNamedCount(BaseModel):
    id: UUID | None = None
    name: str
    count: int
    icon: str | None = None
    country_code: str | None = None


class DashboardRecentPlace(BaseModel):
    id: UUID
    map_id: UUID
    map_name: str
    name: str
    country_name: str
    country_code: str
    region: str | None
    status_name: str
    status_color: str
    is_favorite: bool
    primary_photo_id: UUID | None
    updated_at: datetime


class DashboardRecentTrip(BaseModel):
    id: UUID
    map_id: UUID
    map_name: str
    name: str
    status: str
    start_date: date | None
    end_date: date | None
    day_count: int
    route_distance_meters: float
    route_duration_seconds: float
    updated_at: datetime


class DashboardAttention(BaseModel):
    without_photos: int
    without_categories: int
    without_coordinates: int
    without_region: int
    possible_duplicates: int
    stale_routes: int
    incomplete_map_metadata: int


class DashboardMapPoint(BaseModel):
    latitude: float
    longitude: float
    count: int


class DashboardActivityItem(BaseModel):
    id: UUID
    place_id: UUID
    place_name: str
    action: str
    created_at: datetime


class DashboardRead(BaseModel):
    summary: DashboardSummary
    statuses: list[DashboardStatusItem]
    top_countries: list[DashboardNamedCount]
    top_categories: list[DashboardNamedCount]
    recent_places: list[DashboardRecentPlace]
    recent_trips: list[DashboardRecentTrip]
    attention: DashboardAttention
    map_points: list[DashboardMapPoint]
    activity: list[DashboardActivityItem]
