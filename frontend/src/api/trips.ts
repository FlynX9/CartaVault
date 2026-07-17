import { API_BASE_URL } from '../config'
import { getJson, sendJson, sendWithoutResponse } from './client'
import type { Trip, TripArrival, TripDay, TripDayTimeSummary, TripDayTimingPayload, TripDeparture, TripExport, TripLoadSettings, TripNight, TripOptimization, TripStop, TripSummary, TripVisitStatus } from '../types/trip'

const empty = new URLSearchParams()
export interface TripCreatePayload { name: string; description?: string; start_date?: string; end_date?: string; routing_profile?: 'driving' | 'walking' | 'cycling' }
export interface TripNightCreatePayload { previous_day_id: string; next_day_id: string; place_id?: string; name?: string; latitude?: number; longitude?: number; address?: string; notes?: string; check_in_time?: string; check_out_time?: string }
export interface TripDepartureCreatePayload { place_id?: string; name?: string; latitude?: number; longitude?: number; address?: string; notes?: string; departure_time?: string }
export type TripArrivalCreatePayload = Omit<TripDepartureCreatePayload, 'departure_time'>
export const listTrips = (mapId: string, signal?: AbortSignal) => getJson(`/maps/${mapId}/trips`, empty, signal) as Promise<Trip[]>
export const getTrip = (id: string, signal?: AbortSignal) => getJson(`/trips/${id}`, empty, signal) as Promise<Trip>
export const createTrip = (mapId: string, body: TripCreatePayload) => sendJson(`/maps/${mapId}/trips`, 'POST', body) as Promise<Trip>
export const updateTrip = (id: string, body: Partial<Pick<Trip, 'name' | 'description' | 'start_date' | 'end_date' | 'status'>>) => sendJson(`/trips/${id}`, 'PATCH', body) as Promise<Trip>
export const updateTripLoadSettings = (id: string, body: TripLoadSettings) => sendJson(`/trips/${id}/load-settings`, 'PATCH', body) as Promise<Trip>
export const deleteTrip = (id: string) => sendWithoutResponse(`/trips/${id}`, 'DELETE')
export const duplicateTrip = (id: string) => sendJson(`/trips/${id}/duplicate`, 'POST', {}) as Promise<Trip>
export const addTripDay = (id: string, body: Record<string, unknown> = {}) => sendJson(`/trips/${id}/days`, 'POST', body) as Promise<TripDay>
export const updateTripDay = (id: string, body: Record<string, unknown>) => sendJson(`/trip-days/${id}`, 'PATCH', body) as Promise<TripDay>
export const updateTripDayTiming = (id: string, body: TripDayTimingPayload) => sendJson(`/trip-days/${id}/timing`, 'PATCH', body) as Promise<TripDayTimeSummary>
export const deleteTripDay = (id: string) => sendWithoutResponse(`/trip-days/${id}`, 'DELETE')
export const duplicateTripDay = (id: string) => sendJson(`/trip-days/${id}/duplicate`, 'POST', {}) as Promise<TripDay>
export const reorderTripDays = (id: string, ids: string[]) => sendJson(`/trips/${id}/days/reorder`, 'POST', { ids }) as Promise<Trip>
export const addTripStop = (dayId: string, body: Record<string, unknown>) => sendJson(`/trip-days/${dayId}/stops`, 'POST', body) as Promise<TripStop>
export const updateTripStop = (id: string, body: Record<string, unknown>) => sendJson(`/trip-stops/${id}`, 'PATCH', body) as Promise<TripStop>
export const deleteTripStop = (id: string) => sendWithoutResponse(`/trip-stops/${id}`, 'DELETE')
export const reorderTripStops = (dayId: string, ids: string[]) => sendJson(`/trip-days/${dayId}/stops/reorder`, 'POST', { ids }) as Promise<TripDay>
export const moveTripStop = (id: string, targetDayId: string, sortOrder: number) => sendJson(`/trip-stops/${id}/move`, 'POST', { target_day_id: targetDayId, sort_order: sortOrder }) as Promise<Trip>
export const addTripNight = (tripId: string, body: TripNightCreatePayload) => sendJson(`/trips/${tripId}/nights`, 'POST', body) as Promise<TripNight>
export const deleteTripNight = (id: string) => sendWithoutResponse(`/trip-nights/${id}`, 'DELETE')
export const updateTripNight = (id: string, body: Omit<TripNightCreatePayload, 'previous_day_id' | 'next_day_id'>) => sendJson(`/trip-nights/${id}`, 'PATCH', body) as Promise<TripNight>
export const addTripDeparture = (tripId: string, body: TripDepartureCreatePayload) => sendJson(`/trips/${tripId}/departure`, 'POST', body) as Promise<TripDeparture>
export const updateTripDeparture = (id: string, body: TripDepartureCreatePayload) => sendJson(`/trip-departures/${id}`, 'PATCH', body) as Promise<TripDeparture>
export const deleteTripDeparture = (id: string) => sendWithoutResponse(`/trip-departures/${id}`, 'DELETE')
export const addTripArrival = (tripId: string, body: TripArrivalCreatePayload) => sendJson(`/trips/${tripId}/arrival`, 'POST', body) as Promise<TripArrival>
export const updateTripArrival = (id: string, body: TripArrivalCreatePayload) => sendJson(`/trip-arrivals/${id}`, 'PATCH', body) as Promise<TripArrival>
export const deleteTripArrival = (id: string) => sendWithoutResponse(`/trip-arrivals/${id}`, 'DELETE')
export const calculateTripDayRoute = (id: string) => sendJson(`/trip-days/${id}/route`, 'POST', {}) as Promise<TripDay>
export const optimizeTripDay = (id: string) => sendJson(`/trip-days/${id}/optimize`, 'POST', { metric: 'duration', keep_start: true, keep_end: true, keep_locked: true }) as Promise<TripOptimization>
export const confirmTripOptimization = (id: string, stopIds: string[]) => sendJson(`/trip-days/${id}/optimize/confirm`, 'POST', { stop_ids: stopIds }) as Promise<TripDay>
export const getTripSummary = (id: string) => getJson(`/trips/${id}/summary`, empty) as Promise<TripSummary>
export const getTripDaySummary = (id: string) => getJson(`/trip-days/${id}/summary`, empty) as Promise<TripDayTimeSummary>
export const setTripVisitStatus = (id: string, visitStatus: TripVisitStatus) => sendJson(`/trip-stops/${id}/visit-status`, 'PATCH', { visit_status: visitStatus }) as Promise<TripStop>
export const exportTripGoogleMaps = (id: string) => sendJson(`/trips/${id}/exports/google-maps`, 'POST', {}) as Promise<{ links: Array<{ day_number: number; part: number; url: string }>; warnings: string[] }>
export const exportTripGpx = (id: string) => sendJson(`/trips/${id}/exports/gpx`, 'POST', {}) as Promise<TripExport>
export const exportTripKmz = (id: string) => sendJson(`/trips/${id}/exports/kmz`, 'POST', {}) as Promise<TripExport>
export const tripExportUrl = (path: string) => `${API_BASE_URL}${path}`
