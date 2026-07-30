import { Fragment, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { divIcon, LatLngBounds, type Marker as LeafletMarker } from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip } from 'react-leaflet'

import type { BasemapId } from '../../map/basemaps'
import type { GeocodingResult } from '../../geocoding/types'
import { BasemapLayer } from './BasemapLayer'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView } from '../../types/place'
import { MapBoundsWatcher } from './MapBoundsWatcher'
import { MapFocusController } from './MapFocusController'
import { MapResizeWatcher } from './MapResizeWatcher'
import { MapContextEvents } from './MapContextEvents'
import type { MapContextMenuState } from './mapContextMenuUtils'
import { getStatusMarkerIcon } from './markerIcons'
import { DraftPositionMarker } from './DraftPositionMarker'
import { MapDoubleClickZoomController } from './MapDoubleClickZoomController'
import { MapClusterLayer } from './MapClusterLayer'
import { CountryMaskLayer } from './CountryMaskLayer'
import type { MapMarkerFilter } from './mapMarkerFilterContext'
import type { Trip } from '../../types/trip'

const WORLD_BOUNDS = new LatLngBounds([-90, -180], [90, 180])
const MAP_MAX_ZOOM = 19

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
  onBasemapTileError: (id: BasemapId, fatal?: boolean) => void
  temporarySearchResult?: GeocodingResult | null
  onMapContextMenuOpen?: (state: MapContextMenuState) => void
  onMapContextMenuClose?: () => void
  draftPosition?: DraftPosition | null
  draftPlaceId?: string | null
  onDraftPositionChange?: (position: DraftPosition) => void
  markerFilter?: MapMarkerFilter
  trip?: Trip | null
  tripViewOnly?: boolean
  hiddenTripDayIds?: ReadonlySet<string>
  activeTripDayId?: string | null
  selectionMode?: boolean
  selectedPlaceIds?: ReadonlySet<string>
  onPlaceSelectionToggle?: (placeId: string) => void
  countryId?: string | null
  countryMaskEnabled?: boolean
}

const PlaceMarker = memo(function PlaceMarker({ place, selected, muted, selectionMode, bulkSelected, onSelect, onSelectionToggle }: { place: MapPlace; selected: boolean; muted: boolean; selectionMode: boolean; bulkSelected: boolean; onSelect: (place: MapPlace) => void; onSelectionToggle: (placeId: string) => void }) {
  const markerRef = useRef<LeafletMarker | null>(null)
  const selectPlace = useCallback(() => onSelect(place), [onSelect, place])
  const toggleSelection = useCallback(() => onSelectionToggle(place.id), [onSelectionToggle, place.id])
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
      icon={getStatusMarkerIcon(place.status.color, place.primary_category_icon, selected || bulkSelected, muted, place.is_favorite)}
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
  hiddenTripDayIds = new Set<string>(),
  activeTripDayId = null,
  selectionMode = false,
  selectedPlaceIds = new Set<string>(),
  onPlaceSelectionToggle = () => undefined,
  countryId = null,
  countryMaskEnabled = true,
}: PoiMapProps) {
  const hasMarkerFilter = markerFilter.query !== '' || markerFilter.categoryId !== '' || markerFilter.statusId !== null || markerFilter.tagId !== ''
  const onPlaceSelectRef = useRef(onPlaceSelect)
  const onPlaceSelectionToggleRef = useRef(onPlaceSelectionToggle)
  onPlaceSelectRef.current = onPlaceSelect
  onPlaceSelectionToggleRef.current = onPlaceSelectionToggle
  const selectPlace = useCallback((place: MapPlace) => onPlaceSelectRef.current(place), [])
  const togglePlaceSelection = useCallback((placeId: string) => onPlaceSelectionToggleRef.current(placeId), [])
  const tripPlaceIds = useMemo(() => new Set(trip?.days.flatMap((day) => day.stops.map((stop) => stop.place_id).filter((id): id is string => id !== null)) ?? []), [trip])
  const matchesMarkerFilter = useCallback((place: MapPlace) => (markerFilter.query === '' || place.name.toLocaleLowerCase().includes(markerFilter.query.toLocaleLowerCase())) && (markerFilter.categoryId === '' || place.category_ids.includes(markerFilter.categoryId)) && (markerFilter.statusId === null || place.status.id === markerFilter.statusId) && (markerFilter.tagId === '' || place.tag_ids.includes(markerFilter.tagId)), [markerFilter])
  const standardPlaces = useMemo(() => places.filter((place) => place.id !== draftPlaceId && (!tripViewOnly || tripPlaceIds.has(place.id)) && (trip === null || !tripPlaceIds.has(place.id) || place.id === selectedPlaceId)), [draftPlaceId, places, selectedPlaceId, trip, tripPlaceIds, tripViewOnly])
  const renderPlace = useCallback((place: MapPlace) => <PlaceMarker key={place.id} place={place} selected={place.id === selectedPlaceId} muted={hasMarkerFilter && !matchesMarkerFilter(place) && place.id !== selectedPlaceId} selectionMode={selectionMode} bulkSelected={selectedPlaceIds.has(place.id)} onSelect={selectPlace} onSelectionToggle={togglePlaceSelection} />, [hasMarkerFilter, matchesMarkerFilter, selectPlace, selectedPlaceId, selectedPlaceIds, selectionMode, togglePlaceSelection])
  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      minZoom={2}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      className="poi-map"
    >
      <BasemapLayer basemapId={basemapId} onTileError={onBasemapTileError} />
      <CountryMaskLayer countryId={countryId} enabled={countryMaskEnabled} />

      <MapBoundsWatcher
        onBoundsChange={onBoundsChange}
        onViewChange={onViewChange}
      />
      <MapFocusController request={focusRequest} />
      <MapResizeWatcher layoutKey={layoutKey} />
      <MapContextEvents onOpen={onMapContextMenuOpen} onClose={onMapContextMenuClose} onMapClick={onPopupClose} />
      <MapDoubleClickZoomController disabled={trip !== null} />

      {temporarySearchResult && <Marker position={[temporarySearchResult.latitude, temporarySearchResult.longitude]} title="Résultat de recherche géographique" icon={divIcon({ className: 'geocoding-marker', html: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="8.5"/><circle cx="14" cy="14" r="2.75"/><path d="M14 1.5v4M14 22.5v4M1.5 14h4M22.5 14h4"/></svg>', iconSize: [28, 28], iconAnchor: [14, 14] })} />}
      {draftPosition && <DraftPositionMarker position={draftPosition} onPositionChange={onDraftPositionChange} />}

      <MapClusterLayer places={standardPlaces} renderPlace={renderPlace} selectedPlaceId={selectedPlaceId} disableClusteringAtZoom={MAP_MAX_ZOOM} />
      {trip && <TripOverlay trip={trip} activeDayId={activeTripDayId} showAllDays={tripViewOnly} hiddenDayIds={hiddenTripDayIds} />}
    </MapContainer>
  )
}

const TRIP_COLORS = ['#0FA68A', '#2563EB', '#9333EA', '#D97706', '#DC2626', '#0891B2', '#65A30D', '#DB2777']
function TripOverlay({ trip, activeDayId, showAllDays, hiddenDayIds }: { trip: Trip; activeDayId: string | null; showAllDays: boolean; hiddenDayIds: ReadonlySet<string> }) {
  const visibleDays = trip.days.filter((day) => !hiddenDayIds.has(day.id))
  return <>{visibleDays.map((day) => { const dayIndex = trip.days.findIndex((item) => item.id === day.id); const color = day.color || TRIP_COLORS[dayIndex % TRIP_COLORS.length]; const active = showAllDays || activeDayId === null || day.id === activeDayId; return <Fragment key={day.id}>{day.route_geometry?.coordinates && <Polyline positions={day.route_geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])} pathOptions={{ color, weight: active ? 5 : 4, opacity: active ? .9 : .6 }} />}{day.stops.map((stop, index) => <CircleMarker key={stop.id} center={[stop.latitude, stop.longitude]} radius={active ? 9 : 7} pathOptions={{ color: 'white', fillColor: color, fillOpacity: active ? 1 : .65, weight: 2 }}><Tooltip permanent direction="center" className="trip-stop-number">{index + 1}</Tooltip></CircleMarker>)}</Fragment>})}{trip.departure && <CircleMarker center={[trip.departure.latitude, trip.departure.longitude]} radius={8} pathOptions={{ color: '#0D1B2A', fillColor: '#0FA68A', fillOpacity: 1, weight: 2 }}><Tooltip permanent direction="top">D</Tooltip></CircleMarker>}{trip.nights.map((night) => <CircleMarker key={night.id} center={[night.latitude, night.longitude]} radius={8} pathOptions={{ color: '#0D1B2A', fillColor: '#C8A14A', fillOpacity: 1, weight: 2 }}><Tooltip permanent direction="top">H</Tooltip></CircleMarker>)}</>
}
