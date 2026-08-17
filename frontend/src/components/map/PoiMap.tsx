import { Fragment, memo, useCallback, useEffect, useMemo, useReducer, useRef, type CSSProperties } from 'react'
import { divIcon, LatLngBounds, type Marker as LeafletMarker } from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip } from 'react-leaflet'
import { Flag, Play } from 'lucide-react'

import type { BasemapId } from '../../map/basemaps'
import type { GeocodingResult } from '../../geocoding/types'
import { BasemapLayer } from './BasemapLayer'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView } from '../../types/place'
import { MapBoundsWatcher } from './MapBoundsWatcher'
import { MapFocusController } from './MapFocusController'
import { MapResizeWatcher } from './MapResizeWatcher'
import { MapContextEvents } from './MapContextEvents'
import type { MapContextMenuState } from './mapContextMenuUtils'
import { getCircularPoiMarkerIcon, getStatusMarkerIcon, invalidateStatusMarkerIcons } from './markerIcons'
import { loadCategoryIconData } from '../../icons/categoryIconData'
import { DraftPositionMarker } from './DraftPositionMarker'
import { MapDoubleClickZoomController } from './MapDoubleClickZoomController'
import { MapClusterLayer } from './MapClusterLayer'
import { CountryMaskLayer } from './CountryMaskLayer'
import { MapMeasurementLayer } from './MapMeasurementLayer'
import type { MeasurementPoint } from './measurement'
import { mapPlaceMatchesMarkerFilter, type MapMarkerFilter } from './mapMarkerFilterContext'
import { MapTemporaryToolsLayer } from './MapTemporaryToolsLayer'
import type { MapExtent } from './mapExtent'
import type { InternalMapToolMode } from './mapToolMode'
import type { Trip, TripDay, TripNightTarget } from '../../types/trip'
import type { PlaceAnnotation } from '../../types/annotation'
import { PlaceAnnotationLayer } from './PlaceAnnotationLayer'
import { AnnotationDrawingLayer, type AnnotationDrawingState } from './AnnotationDrawingLayer'

const WORLD_BOUNDS = new LatLngBounds([-90, -180], [90, 180])
const MAP_MAX_ZOOM = 19
export const MAP_CLUSTERING_DISABLE_ZOOM = 11

interface PoiMapProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  focusRequest: MapFocusRequest | null
  layoutKey: string
  onPopupClose: () => void
  basemapId: BasemapId
  onBasemapTileError: (id: BasemapId, fatal?: boolean, reason?: string) => void
  temporarySearchResult?: GeocodingResult | null
  onMapContextMenuOpen?: (state: MapContextMenuState) => void
  onMapContextMenuClose?: () => void
  draftPosition?: DraftPosition | null
  draftPlaceId?: string | null
  onDraftPositionChange?: (position: DraftPosition) => void
  markerFilter?: MapMarkerFilter
  trip?: Trip | null
  tripViewOnly?: boolean
  selectedTripStopId?: string | null
  selectedTripTimelineKey?: string | null
  hiddenTripDayIds?: ReadonlySet<string>
  activeTripDayId?: string | null
  activeTripNightTarget?: TripNightTarget | null
  selectionMode?: boolean
  selectedPlaceIds?: ReadonlySet<string>
  onPlaceSelectionToggle?: (placeId: string) => void
  countryId?: string | null
  countryCode?: string | null
  countryMaskEnabled?: boolean
  measurementActive?: boolean
  measurementPoints?: readonly MeasurementPoint[]
  measurementLocale?: string
  onMeasurementPointAdd?: (point: MeasurementPoint) => void
  mapToolMode?: InternalMapToolMode
  temporaryExtent?: MapExtent | null
  temporaryCoordinate?: MeasurementPoint | null
  geolocationFix?: (MeasurementPoint & { accuracy: number }) | null
  onTemporaryExtentChange?: (extent: MapExtent) => void
  onTemporaryCoordinateChange?: (point: MeasurementPoint) => void
  annotations?: PlaceAnnotation[]
  annotationDrawing?: AnnotationDrawingState | null
  onAnnotationDrawingPointsChange?: (points: MeasurementPoint[]) => void
  onAnnotationDrawingComplete?: (points: MeasurementPoint[]) => void
  photoMarkersEnabled?: boolean
}

const PlaceMarker = memo(function PlaceMarker({ place, selected, muted, selectionMode, bulkSelected, photoMarkersEnabled, onSelect, onSelectionToggle }: { place: MapPlace; selected: boolean; muted: boolean; selectionMode: boolean; bulkSelected: boolean; photoMarkersEnabled: boolean; onSelect: (place: MapPlace) => void; onSelectionToggle: (placeId: string) => void }) {
  const markerRef = useRef<LeafletMarker | null>(null)
  const [, iconRevision] = useReducer((value: number) => value + 1, 0)
  const selectPlace = useCallback(() => onSelect(place), [onSelect, place])
  const toggleSelection = useCallback(() => onSelectionToggle(place.id), [onSelectionToggle, place.id])
  useEffect(() => {
    let active = true
    void loadCategoryIconData(place.primary_category_icon).then(() => {
      if (!active) return
      invalidateStatusMarkerIcons(place.primary_category_icon)
      iconRevision()
    })
    return () => { active = false }
  }, [place.primary_category_icon])
  useEffect(() => {
    const element = markerRef.current?.getElement()
    if (!element) return
    element.setAttribute('aria-label', selectionMode ? `${place.name}, ${bulkSelected ? 'sélectionné' : 'non sélectionné'}` : place.name)
    if (selectionMode) element.setAttribute('aria-pressed', String(bulkSelected))
    else element.removeAttribute('aria-pressed')
    if (!selectionMode) return
    const selectWithSpace = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      event.preventDefault()
      toggleSelection()
    }
    element.addEventListener('keydown', selectWithSpace)
    return () => element.removeEventListener('keydown', selectWithSpace)
  }, [bulkSelected, place.name, selectionMode, toggleSelection])
  return (
    <Marker
      ref={markerRef}
      position={[place.latitude, place.longitude]}
      icon={photoMarkersEnabled
        ? getCircularPoiMarkerIcon(place.status.color, place.primary_category_icon, place.primary_photo_id, selected || bulkSelected, muted, place.is_favorite)
        : getStatusMarkerIcon(place.status.color, place.primary_category_icon, selected || bulkSelected, muted, place.is_favorite)}
      eventHandlers={{
        click: selectionMode ? toggleSelection : selectPlace,
      }}
      keyboard
      title={selectionMode ? `${place.name} — ${bulkSelected ? 'sélectionné' : 'non sélectionné'}` : place.name}
    />
  )
})

export function PoiMap({
  places,
  selectedPlaceId,
  initialView,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  focusRequest,
  layoutKey,
  onPopupClose,
  basemapId,
  onBasemapTileError,
  temporarySearchResult = null,
  onMapContextMenuOpen = () => undefined,
  onMapContextMenuClose = () => undefined,
  draftPosition = null,
  draftPlaceId = null,
  onDraftPositionChange = () => undefined,
  markerFilter = { query: '', categoryId: '', statusId: null, tagId: '' },
  trip = null,
  tripViewOnly = false,
  selectedTripStopId = null,
  selectedTripTimelineKey = null,
  hiddenTripDayIds = new Set<string>(),
  activeTripDayId = null,
  activeTripNightTarget = null,
  selectionMode = false,
  selectedPlaceIds = new Set<string>(),
  onPlaceSelectionToggle = () => undefined,
  countryId = null,
  countryCode = null,
  countryMaskEnabled = true,
  measurementActive = false,
  measurementPoints = [],
  measurementLocale = 'fr',
  onMeasurementPointAdd = () => undefined,
  mapToolMode = 'navigation',
  temporaryExtent = null,
  temporaryCoordinate = null,
  geolocationFix = null,
  onTemporaryExtentChange = () => undefined,
  onTemporaryCoordinateChange = () => undefined,
  annotations = [],
  annotationDrawing = null,
  onAnnotationDrawingPointsChange = () => undefined,
  onAnnotationDrawingComplete = () => undefined,
  photoMarkersEnabled = false,
}: PoiMapProps) {
  const hasMarkerFilter = markerFilter.query !== '' || markerFilter.categoryId !== '' || markerFilter.statusId !== null || markerFilter.tagId !== ''
  const onPlaceSelectRef = useRef(onPlaceSelect)
  const onPlaceSelectionToggleRef = useRef(onPlaceSelectionToggle)
  onPlaceSelectRef.current = onPlaceSelect
  onPlaceSelectionToggleRef.current = onPlaceSelectionToggle
  const selectPlace = useCallback((place: MapPlace) => onPlaceSelectRef.current(place), [])
  const togglePlaceSelection = useCallback((placeId: string) => onPlaceSelectionToggleRef.current(placeId), [])
  const tripPlaceIds = useMemo(() => new Set(trip?.days.flatMap((day) => day.stops.map((stop) => stop.place_id).filter((id): id is string => id !== null)) ?? []), [trip])
  const selectedTripPlaceId = useMemo(() => trip?.days.flatMap((day) => day.stops).find((stop) => stop.id === selectedTripStopId)?.place_id ?? null, [selectedTripStopId, trip])
  const matchesMarkerFilter = useCallback((place: MapPlace) => mapPlaceMatchesMarkerFilter(place, markerFilter), [markerFilter])
  const standardPlaces = useMemo(() => places.filter((place) => place.id !== draftPlaceId && (!tripViewOnly || tripPlaceIds.has(place.id)) && (trip === null || !tripPlaceIds.has(place.id) || (place.id === selectedPlaceId && place.id !== selectedTripPlaceId))), [draftPlaceId, places, selectedPlaceId, selectedTripPlaceId, trip, tripPlaceIds, tripViewOnly])
  const renderPlace = useCallback((place: MapPlace) => <PlaceMarker key={place.id} place={place} selected={place.id === selectedPlaceId} muted={hasMarkerFilter && !matchesMarkerFilter(place) && place.id !== selectedPlaceId} selectionMode={selectionMode} bulkSelected={selectedPlaceIds.has(place.id)} photoMarkersEnabled={photoMarkersEnabled} onSelect={selectPlace} onSelectionToggle={togglePlaceSelection} />, [hasMarkerFilter, matchesMarkerFilter, photoMarkersEnabled, selectPlace, selectedPlaceId, selectedPlaceIds, selectionMode, togglePlaceSelection])
  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      minZoom={2}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      className={`poi-map${measurementActive ? ' is-measuring' : ''}`}
    >
      <BasemapLayer basemapId={basemapId} countryCode={countryCode} onTileError={onBasemapTileError} />
      <CountryMaskLayer countryId={countryId} enabled={countryMaskEnabled} />

      <MapBoundsWatcher
        onBoundsChange={onBoundsChange}
        onViewChange={onViewChange}
      />
      <MapFocusController request={focusRequest} />
      <MapResizeWatcher layoutKey={layoutKey} />
      <MapContextEvents onOpen={onMapContextMenuOpen} onClose={onMapContextMenuClose} onMapClick={annotationDrawing ? () => undefined : onPopupClose} />
      <MapDoubleClickZoomController disabled={trip !== null} />
      <MapMeasurementLayer active={measurementActive} locale={measurementLocale} points={measurementPoints} onPointAdd={onMeasurementPointAdd} />
      <MapTemporaryToolsLayer mode={mapToolMode} extent={temporaryExtent} coordinate={temporaryCoordinate} geolocation={geolocationFix} onExtentChange={onTemporaryExtentChange} onCoordinateChange={onTemporaryCoordinateChange} />
      <PlaceAnnotationLayer annotations={annotations} />
      <AnnotationDrawingLayer drawing={annotationDrawing} onPointsChange={onAnnotationDrawingPointsChange} onComplete={onAnnotationDrawingComplete} />

      {temporarySearchResult && <Marker position={[temporarySearchResult.latitude, temporarySearchResult.longitude]} title="Résultat de recherche géographique" icon={divIcon({ className: 'geocoding-marker', html: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="8.5"/><circle cx="14" cy="14" r="2.75"/><path d="M14 1.5v4M14 22.5v4M1.5 14h4M22.5 14h4"/></svg>', iconSize: [28, 28], iconAnchor: [14, 14] })} />}
      {draftPosition && <DraftPositionMarker position={draftPosition} onPositionChange={onDraftPositionChange} />}

      <MapClusterLayer places={standardPlaces} renderPlace={renderPlace} selectedPlaceId={selectedPlaceId} disableClusteringAtZoom={MAP_CLUSTERING_DISABLE_ZOOM} />
      {trip && <TripOverlay trip={trip} activeDayId={activeTripDayId} activeNightTarget={activeTripNightTarget} selectedStopId={selectedTripStopId} selectedTimelineKey={selectedTripTimelineKey} showAllDays={tripViewOnly} hiddenDayIds={hiddenTripDayIds} />}
    </MapContainer>
  )
}

const TRIP_COLORS = ['#0FA68A', '#2563EB', '#9333EA', '#D97706', '#DC2626', '#0891B2', '#65A30D', '#DB2777']
const tripStopMarkerIconCache = new Map<string, ReturnType<typeof divIcon>>()

function getSelectedTripStopIcon(color: string, number: number) {
  const safeColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#0FA68A'
  const key = `${safeColor}:${number}`
  const cached = tripStopMarkerIconCache.get(key)
  if (cached) return cached
  const icon = divIcon({
    className: 'trip-selected-stop-marker-container',
    html: `<span class="trip-selected-stop-marker" style="--trip-stop-color:${safeColor}"><strong>${number}</strong></span>`,
    iconSize: [40, 48],
    iconAnchor: [20, 45],
  })
  if (tripStopMarkerIconCache.size >= 64) tripStopMarkerIconCache.delete(tripStopMarkerIconCache.keys().next().value as string)
  tripStopMarkerIconCache.set(key, icon)
  return icon
}

interface TripDayEndpoint {
  key: string
  latitude: number
  longitude: number
  roles: Array<'start' | 'end'>
  colors: string[]
  arrivalSide?: 'left' | 'right'
}

function tripNightArrivalSide(previousDay: TripDay, endpoint: { longitude: number }) {
  const routeApproach = previousDay.route_geometry?.coordinates
    ?.slice(0, -1)
    .reverse()
    .find(([longitude]) => Math.abs(longitude - endpoint.longitude) > 0.000001)
  const fallbackStop = [...previousDay.stops]
    .reverse()
    .find((stop) => Math.abs(stop.longitude - endpoint.longitude) > 0.000001)
  const previousLongitude = routeApproach?.[0] ?? fallbackStop?.longitude
  return previousLongitude !== undefined && previousLongitude > endpoint.longitude ? 'right' : 'left'
}

function tripDayStart(trip: Trip, day: TripDay, dayIndex: number) {
  const previousNight = trip.nights.find((night) => night.next_day_id === day.id)
  if (previousNight) return { key: `night:${previousNight.id}`, latitude: previousNight.latitude, longitude: previousNight.longitude }
  if (dayIndex === 0 && trip.departure) return { key: `departure:${trip.departure.id}`, latitude: trip.departure.latitude, longitude: trip.departure.longitude }
  const previousStop = trip.days[dayIndex - 1]?.stops.at(-1)
  return previousStop ? { key: `previous-stop:${previousStop.id}`, latitude: previousStop.latitude, longitude: previousStop.longitude } : null
}

function tripDayEnd(trip: Trip, day: TripDay, dayIndex: number) {
  const nextNight = trip.nights.find((night) => night.previous_day_id === day.id)
  if (nextNight) return { key: `night:${nextNight.id}`, latitude: nextNight.latitude, longitude: nextNight.longitude }
  if (dayIndex !== trip.days.length - 1) return null
  const arrival = trip.arrival ?? trip.departure
  return arrival ? { key: `arrival:${arrival.id}`, latitude: arrival.latitude, longitude: arrival.longitude } : null
}

function TripOverlay({ trip, activeDayId, activeNightTarget, selectedStopId, selectedTimelineKey, showAllDays, hiddenDayIds }: { trip: Trip; activeDayId: string | null; activeNightTarget: TripNightTarget | null; selectedStopId: string | null; selectedTimelineKey: string | null; showAllDays: boolean; hiddenDayIds: ReadonlySet<string> }) {
  const visibleDays = trip.days.filter((day) => !hiddenDayIds.has(day.id))
  const highlightedStopId = selectedTimelineKey?.startsWith('stop:') ? selectedTimelineKey.slice(5) : selectedStopId
  const hasSelectedStop = highlightedStopId !== null && visibleDays.some((day) => day.stops.some((stop) => stop.id === highlightedStopId))
  const activeDayIds = new Set<string>()
  if (hasSelectedStop) {
    const selectedDay = visibleDays.find((day) => day.stops.some((stop) => stop.id === highlightedStopId))
    if (selectedDay) activeDayIds.add(selectedDay.id)
  } else if (activeNightTarget?.nightId) {
    activeDayIds.add(activeNightTarget.previousDayId)
    activeDayIds.add(activeNightTarget.nextDayId)
  } else if (activeDayId) activeDayIds.add(activeDayId)

  const endpointDayIds = new Set<string>()
  if (hasSelectedStop) {
    const selectedDay = visibleDays.find((day) => day.stops.some((stop) => stop.id === highlightedStopId))
    if (selectedDay) endpointDayIds.add(selectedDay.id)
  } else if (activeNightTarget?.nightId) {
    endpointDayIds.add(activeNightTarget.nextDayId)
  } else if (activeDayId) endpointDayIds.add(activeDayId)

  const endpoints = new Map<string, TripDayEndpoint>()
  visibleDays.forEach((day) => {
    if (!endpointDayIds.has(day.id)) return
    const dayIndex = trip.days.findIndex((item) => item.id === day.id)
    const color = day.color || TRIP_COLORS[dayIndex % TRIP_COLORS.length]
    const addEndpoint = (endpoint: ReturnType<typeof tripDayStart>, role: 'start' | 'end', endpointColor = color) => {
      if (!endpoint) return
      const current = endpoints.get(endpoint.key)
      if (current) { current.roles.push(role); current.colors.push(endpointColor); return }
      endpoints.set(endpoint.key, { ...endpoint, roles: [role], colors: [endpointColor] })
    }

    const start = tripDayStart(trip, day, dayIndex)
    if (activeNightTarget?.nightId && day.id === activeNightTarget.nextDayId) {
      const previousDayIndex = trip.days.findIndex((item) => item.id === activeNightTarget.previousDayId)
      const previousDay = trip.days[previousDayIndex]
      const previousColor = previousDay?.color || TRIP_COLORS[Math.max(previousDayIndex, 0) % TRIP_COLORS.length]
      addEndpoint(start, 'end', previousColor)
      if (start && previousDay) endpoints.get(start.key)!.arrivalSide = tripNightArrivalSide(previousDay, start)
    }
    addEndpoint(start, 'start')
    addEndpoint(tripDayEnd(trip, day, dayIndex), 'end')
  })

  const inactiveOpacity = showAllDays ? .38 : .6
  const selectedEndpointKey = selectedTimelineKey === 'departure' && trip.departure
    ? `departure:${trip.departure.id}`
    : selectedTimelineKey === 'arrival' && (trip.arrival ?? trip.departure)
      ? `arrival:${(trip.arrival ?? trip.departure)!.id}`
      : selectedTimelineKey?.startsWith('night:')
        ? selectedTimelineKey
        : null
  return <>
    {visibleDays.map((day) => {
      const dayIndex = trip.days.findIndex((item) => item.id === day.id)
      const color = day.color || TRIP_COLORS[dayIndex % TRIP_COLORS.length]
      const containsSelectedStop = day.stops.some((stop) => stop.id === highlightedStopId)
      const active = hasSelectedStop ? containsSelectedStop : activeNightTarget?.nightId ? activeDayIds.has(day.id) : activeDayId === null || day.id === activeDayId
      return <Fragment key={day.id}>
        {day.route_geometry?.coordinates && <Polyline positions={day.route_geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])} pathOptions={{ color, weight: active ? 6 : 3, opacity: active ? .95 : inactiveOpacity }} />}
        {day.stops.map((stop, index) => {
          const selected = stop.id === highlightedStopId
          if (selected && stop.place_id) return <Marker key={stop.id} position={[stop.latitude, stop.longitude]} icon={getSelectedTripStopIcon(color, index + 1)} interactive={false} keyboard={false} />
          return <CircleMarker key={stop.id} center={[stop.latitude, stop.longitude]} radius={selected ? 14 : active ? 10 : 6} pathOptions={{ color: 'white', fillColor: color, fillOpacity: selected || active ? 1 : inactiveOpacity, weight: selected ? 5 : active ? 3 : 2 }}><Tooltip permanent direction="center" className={`trip-stop-number${selected ? ' trip-stop-number--selected' : ''}`}>{index + 1}</Tooltip></CircleMarker>
        })}
      </Fragment>
    })}
    {[...endpoints.values()].map((endpoint) => {
      const startColor = endpoint.colors[0] ?? '#0FA68A'
      const endColor = endpoint.colors.at(-1) ?? startColor
      const selected = endpoint.key === selectedEndpointKey
      const combined = endpoint.roles.includes('end') && endpoint.roles.includes('start')
      const arrivalOnRight = combined && endpoint.arrivalSide === 'right'
      const leftColor = arrivalOnRight ? endColor : startColor
      const rightColor = arrivalOnRight ? startColor : endColor
      const arrivalIcon = endpoint.roles.includes('end') && <Flag aria-label="Arrivée de la journée" size={12} />
      const departureIcon = endpoint.roles.includes('start') && <Play aria-label="Départ de la journée" size={12} />
      return <CircleMarker key={`endpoint:${endpoint.key}`} center={[endpoint.latitude, endpoint.longitude]} radius={selected ? 16 : 12} pathOptions={{ color: combined ? 'transparent' : 'white', fillOpacity: 0, weight: combined ? 0 : selected ? 4 : 3 }}><Tooltip permanent direction="center" className={`trip-day-endpoint-icon${selected ? ' is-selected' : ''}`}><span data-endpoint-roles={endpoint.roles.join('-')} data-arrival-side={endpoint.arrivalSide} style={{ '--trip-endpoint-start-color': leftColor, '--trip-endpoint-end-color': rightColor } as CSSProperties}><span className="trip-day-endpoint-icon__glyphs">{arrivalOnRight ? <>{departureIcon}{arrivalIcon}</> : <>{arrivalIcon}{departureIcon}</>}</span></span></Tooltip></CircleMarker>
    })}
  </>
}
