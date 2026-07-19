import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { divIcon, DomEvent, LatLngBounds, Marker as LeafletMarker, Popup as LeafletPopup } from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, Tooltip } from 'react-leaflet'

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
  popupContent: ReactNode
  onPopupClose: () => void
  basemapId: BasemapId
  onBasemapTileError: () => void
  temporarySearchResult?: GeocodingResult | null
  onMapContextMenuOpen?: (state: MapContextMenuState) => void
  onMapContextMenuClose?: () => void
  draftPosition?: DraftPosition | null
  draftPlaceId?: string | null
  onDraftPositionChange?: (position: DraftPosition) => void
  markerFilter?: MapMarkerFilter
  trip?: Trip | null
  tripViewOnly?: boolean
  activeTripDayId?: string | null
  onTripPlaceAdd?: (place: MapPlace) => void
}

const PlaceMarker = memo(function PlaceMarker({ place, selected, muted, popupContent, onSelect, onDoubleClick, onPopupClose }: { place: MapPlace; selected: boolean; muted: boolean; popupContent: ReactNode; onSelect: () => void; onDoubleClick?: () => void; onPopupClose: () => void }) {
  const markerRef = useRef<LeafletMarker>(null)
  const popupRef = useRef<LeafletPopup>(null)
  const popupOpenedRef = useRef(false)
  const controlledCloseRef = useRef(false)

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!selected && popup !== null && popupOpenedRef.current) {
      controlledCloseRef.current = true
      popup.close()
    }
  }, [selected])

  useEffect(() => {
    const marker = markerRef.current
    const popup = popupRef.current
    if (selected && marker !== null && popup !== null && marker.getPopup() === popup) {
      marker.openPopup()
      if (marker.isPopupOpen()) {
        popupOpenedRef.current = true
      }
    }
  }, [selected])

  return (
    <Marker
      ref={markerRef}
      position={[place.latitude, place.longitude]}
      icon={getStatusMarkerIcon(place.status.color, place.categories.find((category) => category.is_primary)?.icon, selected, muted)}
      eventHandlers={{
        click: onSelect,
        dblclick: (event) => { if (onDoubleClick) { DomEvent.stop(event.originalEvent); onDoubleClick() } },
        popupopen: () => { popupOpenedRef.current = true },
        popupclose: () => {
          const controlledClose = controlledCloseRef.current
          popupOpenedRef.current = false
          controlledCloseRef.current = false
          if (!controlledClose && selected) {
            onPopupClose()
          }
        },
      }}
      title={place.name}
    >
      <Popup
        ref={popupRef}
        autoPan={false}
        closeOnClick
        maxWidth={430}
        minWidth={300}
        closeButton={false}
      >
        {selected && popupContent ? popupContent : <p className="place-popup-loading">Chargement…</p>}
      </Popup>
    </Marker>
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
  popupContent,
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
  activeTripDayId = null,
  onTripPlaceAdd,
}: PoiMapProps) {
  const hasMarkerFilter = markerFilter.query !== '' || markerFilter.categoryId !== '' || markerFilter.statusId !== null || markerFilter.tagId !== ''
  const tripPlaceIds = useMemo(() => new Set(trip?.days.flatMap((day) => day.stops.map((stop) => stop.place_id).filter((id): id is string => id !== null)) ?? []), [trip])
  const matchesMarkerFilter = useCallback((place: MapPlace) => (markerFilter.query === '' || place.name.toLocaleLowerCase().includes(markerFilter.query.toLocaleLowerCase())) && (markerFilter.categoryId === '' || place.categories.some((category) => category.id === markerFilter.categoryId)) && (markerFilter.statusId === null || place.status.id === markerFilter.statusId) && (markerFilter.tagId === '' || place.tags.some((tag) => tag.id === markerFilter.tagId)), [markerFilter])
  const standardPlaces = useMemo(() => places.filter((place) => place.id !== draftPlaceId && (!tripViewOnly || tripPlaceIds.has(place.id)) && (trip === null || !tripPlaceIds.has(place.id) || place.id === selectedPlaceId)), [draftPlaceId, places, selectedPlaceId, trip, tripPlaceIds, tripViewOnly])
  const renderPlace = useCallback((place: MapPlace) => <PlaceMarker key={place.id} place={place} selected={place.id === selectedPlaceId} muted={hasMarkerFilter && !matchesMarkerFilter(place) && place.id !== selectedPlaceId} popupContent={place.id === selectedPlaceId ? popupContent : null} onSelect={() => onPlaceSelect(place)} onDoubleClick={onTripPlaceAdd ? () => onTripPlaceAdd(place) : undefined} onPopupClose={onPopupClose} />, [hasMarkerFilter, matchesMarkerFilter, onPlaceSelect, onPopupClose, onTripPlaceAdd, popupContent, selectedPlaceId])
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

      <MapBoundsWatcher
        onBoundsChange={onBoundsChange}
        onViewChange={onViewChange}
      />
      <MapFocusController request={focusRequest} />
      <MapResizeWatcher layoutKey={layoutKey} />
      <MapContextEvents onOpen={onMapContextMenuOpen} onClose={onMapContextMenuClose} />
      <MapDoubleClickZoomController disabled={trip !== null} />

      {temporarySearchResult && <Marker position={[temporarySearchResult.latitude, temporarySearchResult.longitude]} title="Résultat de recherche géographique" icon={divIcon({ className: 'geocoding-marker', html: '<span aria-hidden="true">●</span>', iconSize: [24, 24], iconAnchor: [12, 12] })} />}
      {draftPosition && <DraftPositionMarker position={draftPosition} onPositionChange={onDraftPositionChange} />}

      <MapClusterLayer places={standardPlaces} renderPlace={renderPlace} />
      {trip && <TripOverlay trip={trip} activeDayId={activeTripDayId} showAllDays={tripViewOnly} />}
    </MapContainer>
  )
}

const TRIP_COLORS = ['#0FA68A', '#2563EB', '#9333EA', '#D97706', '#DC2626', '#0891B2', '#65A30D', '#DB2777']
function TripOverlay({ trip, activeDayId, showAllDays }: { trip: Trip; activeDayId: string | null; showAllDays: boolean }) {
  return <>{trip.days.map((day, dayIndex) => { const color = day.color || TRIP_COLORS[dayIndex % TRIP_COLORS.length]; const active = showAllDays || activeDayId === null || day.id === activeDayId; return <Fragment key={day.id}>{day.route_geometry?.coordinates && <Polyline positions={day.route_geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])} pathOptions={{ color, weight: active ? 5 : 3, opacity: active ? .9 : .28 }} />}{day.stops.map((stop, index) => <CircleMarker key={stop.id} center={[stop.latitude, stop.longitude]} radius={active ? 9 : 6} pathOptions={{ color: 'white', fillColor: color, fillOpacity: active ? 1 : .38, weight: 2 }}><Tooltip permanent direction="center" className="trip-stop-number">{index + 1}</Tooltip></CircleMarker>)}</Fragment>})}{trip.departure && <CircleMarker center={[trip.departure.latitude, trip.departure.longitude]} radius={8} pathOptions={{ color: '#0D1B2A', fillColor: '#0FA68A', fillOpacity: 1, weight: 2 }}><Tooltip permanent direction="top">D</Tooltip></CircleMarker>}{trip.nights.map((night) => <CircleMarker key={night.id} center={[night.latitude, night.longitude]} radius={8} pathOptions={{ color: '#0D1B2A', fillColor: '#C8A14A', fillOpacity: 1, weight: 2 }}><Tooltip permanent direction="top">H</Tooltip></CircleMarker>)}</>
}
