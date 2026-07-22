from __future__ import annotations

from datetime import date, datetime, time
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, Time, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.auth.models import User
    from app.maps.models import PoiMap
    from app.places.models import Place


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("status IN ('draft','planned','in_progress','completed','archived')", name="trips_status_check"),
        CheckConstraint("end_date IS NULL OR start_date IS NULL OR end_date >= start_date", name="trips_dates_check"),
        CheckConstraint("low_load_max_minutes > 0 AND medium_load_max_minutes > low_load_max_minutes", name="trips_load_thresholds_check"),
        CheckConstraint("low_load_color ~ '^#[0-9A-Fa-f]{6}$' AND medium_load_color ~ '^#[0-9A-Fa-f]{6}$' AND high_load_color ~ '^#[0-9A-Fa-f]{6}$'", name="trips_load_colors_check"),
        Index("trips_map_id_idx", "map_id"),
        Index("trips_created_by_user_id_idx", "created_by_user_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    map_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("poi_maps.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24), nullable=False, server_default=text("'draft'"))
    routing_profile: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'driving'"))
    low_load_max_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("240"))
    medium_load_max_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("480"))
    low_load_color: Mapped[str] = mapped_column(String(7), nullable=False, server_default=text("'#0FA68A'"))
    medium_load_color: Mapped[str] = mapped_column(String(7), nullable=False, server_default=text("'#D97706'"))
    high_load_color: Mapped[str] = mapped_column(String(7), nullable=False, server_default=text("'#DC2626'"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)

    map: Mapped["PoiMap"] = relationship(back_populates="trips")
    created_by: Mapped["User"] = relationship(back_populates="created_trips")
    days: Mapped[list["TripDay"]] = relationship(back_populates="trip", cascade="all, delete-orphan", passive_deletes=True, order_by="TripDay.sort_order")
    nights: Mapped[list["TripNight"]] = relationship(back_populates="trip", cascade="all, delete-orphan", passive_deletes=True)
    departure: Mapped["TripDeparture | None"] = relationship(back_populates="trip", cascade="all, delete-orphan", passive_deletes=True, uselist=False)
    arrival: Mapped["TripArrival | None"] = relationship(back_populates="trip", cascade="all, delete-orphan", passive_deletes=True, uselist=False)


class TripDay(Base):
    __tablename__ = "trip_days"
    __table_args__ = (
        UniqueConstraint("trip_id", "day_number", name="trip_days_trip_day_number_key"),
        UniqueConstraint("trip_id", "sort_order", name="trip_days_trip_sort_order_key"),
        CheckConstraint("day_number > 0 AND sort_order >= 0", name="trip_days_order_check"),
        CheckConstraint("max_total_duration_minutes IS NULL OR max_total_duration_minutes > 0", name="trip_days_max_duration_check"),
        CheckConstraint("default_stop_buffer_minutes BETWEEN 0 AND 720", name="trip_days_buffer_check"),
        CheckConstraint("safety_margin_type IN ('fixed','percentage')", name="trip_days_margin_type_check"),
        CheckConstraint("(safety_margin_type = 'fixed' AND safety_margin_value BETWEEN 0 AND 720) OR (safety_margin_type = 'percentage' AND safety_margin_value BETWEEN 0 AND 100)", name="trip_days_margin_value_check"),
        CheckConstraint("color ~ '^#[0-9A-Fa-f]{6}$'", name="trip_days_color_check"),
        CheckConstraint(
            "route_provider IS NULL OR route_provider IN ('osrm','google')",
            name="trip_days_route_provider_check",
        ),
        Index("trip_days_trip_id_idx", "trip_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date | None] = mapped_column(Date)
    title: Mapped[str | None] = mapped_column(String(160))
    color: Mapped[str] = mapped_column(String(7), nullable=False, server_default=text("'#0FA68A'"))
    notes: Mapped[str | None] = mapped_column(Text)
    planned_start_time: Mapped[time | None] = mapped_column(Time)
    planned_end_time: Mapped[time | None] = mapped_column(Time)
    target_arrival_time: Mapped[time | None] = mapped_column(Time)
    default_stop_buffer_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    safety_margin_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'fixed'"))
    safety_margin_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_total_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    route_distance_meters: Mapped[float | None] = mapped_column(Float)
    route_duration_seconds: Mapped[float | None] = mapped_column(Float)
    visit_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    total_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    route_geometry: Mapped[dict | None] = mapped_column(JSONB)
    route_segments: Mapped[list | None] = mapped_column(JSONB)
    route_status: Mapped[str | None] = mapped_column(String(24))
    route_provider: Mapped[str | None] = mapped_column(String(16))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trip: Mapped[Trip] = relationship(back_populates="days")
    stops: Mapped[list["TripStop"]] = relationship(back_populates="day", cascade="all, delete-orphan", passive_deletes=True, order_by="TripStop.sort_order")
    previous_night: Mapped["TripNight | None"] = relationship(back_populates="next_day", foreign_keys="TripNight.next_day_id", uselist=False)
    next_night: Mapped["TripNight | None"] = relationship(back_populates="previous_day", foreign_keys="TripNight.previous_day_id", uselist=False)


class TripStop(Base):
    __tablename__ = "trip_stops"
    __table_args__ = (
        UniqueConstraint("trip_day_id", "sort_order", name="trip_stops_day_sort_order_key"),
        CheckConstraint("stop_type IN ('place','free_location','hotel','restaurant','parking','station','airport','other')", name="trip_stops_type_check"),
        CheckConstraint("visit_status IN ('planned','visited','skipped','inaccessible','postponed')", name="trip_stops_visit_status_check"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_stops_coordinates_check"),
        CheckConstraint("sort_order >= 0 AND (visit_duration_minutes IS NULL OR visit_duration_minutes >= 0)", name="trip_stops_order_duration_check"),
        Index("trip_stops_day_id_idx", "trip_day_id"),
        Index("trip_stops_place_id_idx", "place_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_day_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trip_days.id", ondelete="CASCADE"), nullable=False)
    place_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="SET NULL"))
    stop_type: Mapped[str] = mapped_column(String(24), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    visit_duration_minutes: Mapped[int | None] = mapped_column(Integer)
    planned_arrival: Mapped[time | None] = mapped_column(Time)
    planned_departure: Mapped[time | None] = mapped_column(Time)
    notes: Mapped[str | None] = mapped_column(Text)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    visit_status: Mapped[str] = mapped_column(String(24), nullable=False, server_default=text("'planned'"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    day: Mapped[TripDay] = relationship(back_populates="stops")
    place: Mapped["Place | None"] = relationship(back_populates="trip_stops")


class TripNight(Base):
    __tablename__ = "trip_nights"
    __table_args__ = (
        UniqueConstraint("trip_id", "previous_day_id", "next_day_id", name="trip_nights_trip_days_key"),
        UniqueConstraint("previous_day_id", name="trip_nights_previous_day_key"),
        UniqueConstraint("next_day_id", name="trip_nights_next_day_key"),
        CheckConstraint("previous_day_id <> next_day_id", name="trip_nights_distinct_days_check"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_nights_coordinates_check"),
        Index("trip_nights_trip_id_idx", "trip_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    previous_day_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trip_days.id", ondelete="CASCADE"), nullable=False)
    next_day_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trip_days.id", ondelete="CASCADE"), nullable=False)
    place_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    check_in_time: Mapped[time | None] = mapped_column(Time)
    check_out_time: Mapped[time | None] = mapped_column(Time)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trip: Mapped[Trip] = relationship(back_populates="nights")
    previous_day: Mapped[TripDay] = relationship(back_populates="next_night", foreign_keys=[previous_day_id])
    next_day: Mapped[TripDay] = relationship(back_populates="previous_night", foreign_keys=[next_day_id])
    place: Mapped["Place | None"] = relationship(back_populates="trip_nights")


class TripDeparture(Base):
    __tablename__ = "trip_departures"
    __table_args__ = (
        UniqueConstraint("trip_id", name="trip_departures_trip_id_key"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_departures_coordinates_check"),
        Index("trip_departures_trip_id_idx", "trip_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    place_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    departure_time: Mapped[time | None] = mapped_column(Time)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trip: Mapped[Trip] = relationship(back_populates="departure")
    place: Mapped["Place | None"] = relationship()


class TripArrival(Base):
    __tablename__ = "trip_arrivals"
    __table_args__ = (
        UniqueConstraint("trip_id", name="trip_arrivals_trip_id_key"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="trip_arrivals_coordinates_check"),
        Index("trip_arrivals_trip_id_idx", "trip_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    place_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trip: Mapped[Trip] = relationship(back_populates="arrival")
    place: Mapped["Place | None"] = relationship()
