import { divIcon, type LatLngExpression } from 'leaflet'
import { useMemo, useState, type ReactNode } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'

import type { MapPlace } from '../../types/place'
import { clusterMapPlaces } from './mapClusterUtils'

function clusterClassName(count: number): string {
  if (count >= 50) return 'large'
  if (count >= 10) return 'medium'
  return 'small'
}

function createClusterIcon(count: number) {
  const size = count >= 50 ? 46 : count >= 10 ? 40 : 34
  return divIcon({
    className: 'cv-map-cluster-container',
    html: `<button class="cv-map-cluster cv-map-cluster--${clusterClassName(count)}" type="button" tabindex="-1" aria-label="Cluster de ${count} lieux"><span>${count}</span><small>lieux</small></button>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

interface Props {
  places: MapPlace[]
  renderPlace: (place: MapPlace) => ReactNode
  selectedPlaceId?: string | null
  disableClusteringAtZoom: number
}

export function MapClusterLayer({ places, renderPlace, selectedPlaceId = null, disableClusteringAtZoom }: Props) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const selectedPlace = useMemo(() => places.find((place) => place.id === selectedPlaceId) ?? null, [places, selectedPlaceId])
  const clusteredPlaces = useMemo(() => selectedPlace === null ? places : places.filter((place) => place.id !== selectedPlace.id), [places, selectedPlace])
  const clusters = useMemo(() => clusterMapPlaces(
    clusteredPlaces,
    (place) => map.project([place.latitude, place.longitude], zoom),
    zoom < disableClusteringAtZoom,
  ), [clusteredPlaces, disableClusteringAtZoom, map, zoom])

  const renderedPlaces = clusters.map((cluster) => {
    if (cluster.places.length === 1) return renderPlace(cluster.places[0])
    const position: LatLngExpression = [cluster.latitude, cluster.longitude]
    return <Marker key={`cluster:${cluster.id}`} position={position} icon={createClusterIcon(cluster.places.length)} keyboard title={`Cluster de ${cluster.places.length} lieux`} eventHandlers={{ click: () => {
      const bounds = cluster.places.map((place) => [place.latitude, place.longitude] as [number, number])
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: Math.min(disableClusteringAtZoom, map.getZoom() + 3) })
    } }} />
  })

  if (selectedPlace !== null) {
    renderedPlaces.unshift(renderPlace(selectedPlace))
  }

  return <>{renderedPlaces}</>
}
