from __future__ import annotations

from datetime import date as DateValue, datetime, time as TimeValue
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

TripStatus = Literal["draft", "planned", "in_progress", "completed", "archived"]
StopType = Literal["place", "free_location", "hotel", "restaurant", "parking", "station", "airport", "other"]
VisitStatus = Literal["planned", "visited", "skipped", "inaccessible", "postponed"]
SafetyMarginType = Literal["fixed", "percentage"]
LoadLevel = Literal["low", "medium", "high", "unavailable"]
HEX_COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"


class TripCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: DateValue | None = None
    end_date: DateValue | None = None
    routing_profile: str = Field(default="driving", pattern="^(driving|walking|cycling)$")

    @model_validator(mode="after")
    def dates(self) -> Self:
        self.name = self.name.strip()
        if not self.name: raise ValueError("Name cannot be empty")
        if self.start_date and self.end_date and self.end_date < self.start_date: raise ValueError("End date must follow start date")
        return self


class TripUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: DateValue | None = None
    end_date: DateValue | None = None
    status: TripStatus | None = None
    routing_profile: str | None = Field(default=None, pattern="^(driving|walking|cycling)$")

    @model_validator(mode="after")
    def values(self) -> Self:
        if "name" in self.model_fields_set:
            if self.name is None or not self.name.strip(): raise ValueError("Name cannot be empty")
            self.name = self.name.strip()
        return self


class TripLoadSettings(BaseModel):
    low_load_max_minutes: int = Field(gt=0, le=1440)
    medium_load_max_minutes: int = Field(gt=0, le=2880)
    low_load_color: str = Field(pattern=HEX_COLOR_PATTERN)
    medium_load_color: str = Field(pattern=HEX_COLOR_PATTERN)
    high_load_color: str = Field(pattern=HEX_COLOR_PATTERN)

    @model_validator(mode="after")
    def thresholds(self) -> Self:
        if self.low_load_max_minutes >= self.medium_load_max_minutes:
            raise ValueError("Low load threshold must be lower than medium load threshold")
        return self


class DayCreate(BaseModel):
    date: DateValue | None = None
    title: str | None = Field(default=None, max_length=160)
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    notes: str | None = Field(default=None, max_length=10_000)
    planned_start_time: TimeValue | None = None
    planned_end_time: TimeValue | None = None
    max_total_duration_minutes: int | None = Field(default=None, gt=0, le=1440)


class DayUpdate(DayCreate):
    pass


class TripDayTimingUpdate(BaseModel):
    target_arrival_time: TimeValue | None = None
    default_stop_buffer_minutes: int = Field(ge=0, le=720)
    safety_margin_type: SafetyMarginType
    safety_margin_value: int = Field(ge=0)

    @model_validator(mode="after")
    def margin_limit(self) -> Self:
        maximum = 720 if self.safety_margin_type == "fixed" else 100
        if self.safety_margin_value > maximum:
            raise ValueError(f"Safety margin cannot exceed {maximum}")
        return self


class StopCreate(BaseModel):
    place_id: UUID | None = None
    stop_type: StopType = "place"
    name: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    visit_duration_minutes: int | None = Field(default=30, ge=0, le=1440)
    notes: str | None = Field(default=None, max_length=10_000)
    is_required: bool = True
    is_locked: bool = False

    @model_validator(mode="after")
    def source(self) -> Self:
        if self.place_id is None and (not self.name or self.latitude is None or self.longitude is None): raise ValueError("A free stop needs name and coordinates")
        if (self.latitude is None) != (self.longitude is None): raise ValueError("Latitude and longitude must be supplied together")
        return self


class StopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    stop_type: StopType | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    visit_duration_minutes: int | None = Field(default=None, ge=0, le=1440)
    planned_arrival: TimeValue | None = None
    planned_departure: TimeValue | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    is_required: bool | None = None
    is_locked: bool | None = None
    visit_status: VisitStatus | None = None


class NightCreate(BaseModel):
    previous_day_id: UUID
    next_day_id: UUID
    place_id: UUID | None = None
    name: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=10_000)
    check_in_time: TimeValue | None = None
    check_out_time: TimeValue | None = None

    @model_validator(mode="after")
    def source(self) -> Self:
        if self.place_id is None and (not self.name or self.latitude is None or self.longitude is None): raise ValueError("A free night needs name and coordinates")
        return self


class NightUpdate(BaseModel):
    place_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=10_000)
    check_in_time: TimeValue | None = None
    check_out_time: TimeValue | None = None


class DepartureCreate(BaseModel):
    place_id: UUID | None = None
    name: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=10_000)
    departure_time: TimeValue | None = None

    @model_validator(mode="after")
    def source(self) -> Self:
        if self.place_id is None and (not self.name or self.latitude is None or self.longitude is None): raise ValueError("A free departure needs name and coordinates")
        return self


class DepartureUpdate(DepartureCreate):
    pass


class ArrivalCreate(BaseModel):
    place_id: UUID | None = None
    name: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=10_000)

    @model_validator(mode="after")
    def source(self) -> Self:
        if self.place_id is None and (not self.name or self.latitude is None or self.longitude is None): raise ValueError("A free arrival needs name and coordinates")
        return self


class ArrivalUpdate(ArrivalCreate):
    pass


class IdOrder(BaseModel):
    ids: list[UUID] = Field(min_length=1)


class StopMove(BaseModel):
    target_day_id: UUID
    sort_order: int = Field(ge=0)


class OptimizeOptions(BaseModel):
    metric: Literal["duration", "distance"] = "duration"
    return_to_start: bool = False
    keep_start: bool = True
    keep_end: bool = True
    keep_locked: bool = True


class OptimizeConfirm(BaseModel):
    stop_ids: list[UUID] = Field(min_length=1)


class ApplyPlaceStatuses(BaseModel):
    mappings: dict[VisitStatus, UUID | None]
    confirm: bool = False


class ORMRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StopRead(ORMRead):
    id: UUID; trip_day_id: UUID; place_id: UUID | None; stop_type: str; name: str; latitude: float; longitude: float
    address: str | None; sort_order: int; visit_duration_minutes: int | None; planned_arrival: TimeValue | None; planned_departure: TimeValue | None
    notes: str | None; is_required: bool; is_locked: bool; visit_status: str; created_at: datetime; updated_at: datetime


class NightRead(ORMRead):
    id: UUID; trip_id: UUID; previous_day_id: UUID; next_day_id: UUID; place_id: UUID | None; name: str; latitude: float; longitude: float
    address: str | None; notes: str | None; check_in_time: TimeValue | None; check_out_time: TimeValue | None; created_at: datetime; updated_at: datetime


class DepartureRead(ORMRead):
    id: UUID; trip_id: UUID; place_id: UUID | None; name: str; latitude: float; longitude: float
    address: str | None; notes: str | None; departure_time: TimeValue | None; created_at: datetime; updated_at: datetime


class ArrivalRead(ORMRead):
    id: UUID; trip_id: UUID; place_id: UUID | None; name: str; latitude: float; longitude: float
    address: str | None; notes: str | None; created_at: datetime; updated_at: datetime


class DayRead(ORMRead):
    id: UUID; trip_id: UUID; day_number: int; date: DateValue | None; title: str | None; notes: str | None; planned_start_time: TimeValue | None; planned_end_time: TimeValue | None
    color: str
    target_arrival_time: TimeValue | None; default_stop_buffer_minutes: int; safety_margin_type: str; safety_margin_value: int
    max_total_duration_minutes: int | None; route_distance_meters: float | None; route_duration_seconds: float | None; visit_duration_minutes: int | None
    total_duration_minutes: int | None; route_geometry: dict | None; route_segments: list | None; route_status: str | None; sort_order: int
    created_at: datetime; updated_at: datetime; stops: list[StopRead] = Field(default_factory=list)


class TripRead(ORMRead):
    id: UUID; map_id: UUID; created_by_user_id: UUID; name: str; description: str | None; start_date: DateValue | None; end_date: DateValue | None
    status: str; routing_profile: str; created_at: datetime; updated_at: datetime; completed_at: datetime | None; archived_at: datetime | None
    low_load_max_minutes: int; medium_load_max_minutes: int; low_load_color: str; medium_load_color: str; high_load_color: str
    days: list[DayRead] = Field(default_factory=list); nights: list[NightRead] = Field(default_factory=list); departure: DepartureRead | None = None; arrival: ArrivalRead | None = None


class TripSummaryRead(BaseModel):
    trip_id: UUID; days: int; nights: int; stops: int; unique_places: int; distance_meters: float; route_duration_seconds: float
    visit_duration_minutes: int; total_duration_minutes: int; visit_status_counts: dict[str, int]
    total_route_distance_meters: float; total_route_distance_km: float; total_route_duration_seconds: float; total_route_duration_minutes: int
    total_visit_duration_minutes: int; total_pause_duration_minutes: int; total_buffer_duration_minutes: int; total_estimated_duration_minutes: int
    days_with_route: int; days_without_route: int; stale_route_days: int; is_route_summary_complete: bool
    total_safety_margin_minutes: int; total_planned_duration_minutes: int
    low_load_days: int; medium_load_days: int; high_load_days: int
    days_with_complete_time_summary: int; days_with_incomplete_time_summary: int; is_time_summary_complete: bool
    country_constraint_enabled: bool = False; constraint_country_code: str | None = None; constraint_country_name: str | None = None


class DaySummaryRead(BaseModel):
    day_id: UUID; stops: int; required_stops: int; optional_stops: int; distance_meters: float | None
    route_distance_meters: float | None; route_distance_km: float | None; route_duration_seconds: float | None; route_duration_minutes: int | None
    visit_duration_minutes: int; pause_duration_minutes: int; buffer_duration_minutes: int; total_duration_minutes: int | None
    overload_minutes: int; unroutable_segments: int; route_status: str | None; route_is_stale: bool; has_current_route: bool
    safety_margin_minutes: int | None; planned_start_time: TimeValue | None; target_arrival_time: TimeValue | None
    recommended_start_time: TimeValue | None; recommended_start_day_offset: int | None
    estimated_arrival_time: TimeValue | None; estimated_arrival_day_offset: int | None
    schedule_delta_minutes: int | None; schedule_status: Literal["on_time", "early", "late", "unavailable"]
    load_level: LoadLevel; load_color: str | None; is_time_summary_complete: bool
    country_constraint_enabled: bool = False; country_constraint_status: Literal["not_applicable", "unchecked", "valid", "invalid", "unavailable"] = "not_applicable"
    constraint_country_code: str | None = None; constraint_country_name: str | None = None
