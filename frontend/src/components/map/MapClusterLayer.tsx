import { divIcon, type DivIcon, type LatLngExpression } from 'leaflet'
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'

import type { MapPlace } from '../../types/place'
import { clusterMapPlaces } from './mapClusterUtils'

function clusterClassName(count: number): string {
  if (count >= 50) return 'large'
  if (count >= 10) return 'medium'
  return 'small'
}

const clusterIconCache = new Map<number, DivIcon>()

function createClusterIcon(count: number) {
  const cached = clusterIconCache.get(count)
  if (cached !== undefined) return cached
  const size = count >= 50 ? 46 : count >= 10 ? 40 : 34
  const icon = divIcon({
    className: 'cv-map-cluster-container',
    html: `<button class="cv-map-cluster cv-map-cluster--${clusterClassName(count)}" type="button" tabindex="-1" aria-label="Cluster de ${count} lieux"><span>${count}</span><small>lieux</small></button>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  clusterIconCache.set(count, icon)
  return icon
}

const ClusterMarker = memo(function ClusterMarker({ id, count, position, places, onClick }: { id: string; count: number; position: LatLngExpression; places: MapPlace[]; onClick: (places: MapPlace[]) => void }) {
  const handleClick = useCallback(() => onClick(places), [onClick, places])
  return <Marker key={`cluster:${id}`} position={position} icon={createClusterIcon(count)} keyboard title={`Cluster de ${count} lieux`} eventHandlers={{ click: handleClick }} />
})

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
  const zoomToCluster = useCallback((clusterPlaces: MapPlace[]) => {
    const bounds = clusterPlaces.map((place) => [place.latitude, place.longitude] as [number, number])
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: Math.min(disableClusteringAtZoom, map.getZoom() + 3) })
  }, [disableClusteringAtZoom, map])

  const renderedPlaces = clusters.map((cluster) => {
    if (cluster.places.length === 1) return renderPlace(cluster.places[0])
    const position: LatLngExpression = [cluster.latitude, cluster.longitude]
    return <ClusterMarker key={`cluster:${cluster.id}`} id={cluster.id} count={cluster.places.length} position={position} places={cluster.places} onClick={zoomToCluster} />
  })

  if (selectedPlace !== null) {
    renderedPlaces.unshift(renderPlace(selectedPlace))
  }

  return <>{renderedPlaces}</>
}
