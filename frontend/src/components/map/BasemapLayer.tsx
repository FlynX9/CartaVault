import '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

import { getBasemap, type BasemapId, type VectorBasemapDefinition } from '../../map/basemaps'
import { loadCartaVaultStyle } from '../../map/maplibreStyle'

interface BasemapLayerProps {
  basemapId: BasemapId
  onTileError: (id: BasemapId, fatal?: boolean) => void
}

function VectorBasemapLayer({ basemap, onTileError }: { basemap: VectorBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const map = useMap()
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError

  useEffect(() => {
    const controller = new AbortController()
    let layer: L.MaplibreGLLayer | null = null
    let mapLibreErrorHandler: (() => void) | null = null

    void loadCartaVaultStyle(basemap.styleUrl, basemap.tileJsonUrl, basemap.glyphsUrl, controller.signal)
      .then((style) => {
        if (controller.signal.aborted) return
        layer = L.maplibreGL({ style, interactive: false, attributionControl: false })
        layer.addTo(map)
        map.attributionControl?.addAttribution(basemap.attribution)
        mapLibreErrorHandler = () => onTileErrorRef.current(basemap.id)
        layer.getMaplibreMap().on('error', mapLibreErrorHandler)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) onTileErrorRef.current(basemap.id, true)
      })

    return () => {
      controller.abort()
      if (layer !== null) {
        if (mapLibreErrorHandler !== null) layer.getMaplibreMap().off('error', mapLibreErrorHandler)
        layer.removeFrom(map)
        map.attributionControl?.removeAttribution(basemap.attribution)
      }
    }
  }, [basemap, map])

  return null
}

/** Switching the base layer never recreates the Leaflet MapContainer or its overlays. */
export function BasemapLayer({ basemapId, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)

  if (basemap.kind === 'vector') {
    return <VectorBasemapLayer key={basemap.id} basemap={basemap} onTileError={onTileError} />
  }

  return (
    <TileLayer
      key={basemap.id}
      url={basemap.url}
      attribution={basemap.attribution}
      maxZoom={basemap.maxZoom}
      detectRetina
      eventHandlers={{ tileerror: () => onTileError(basemap.id) }}
    />
  )
}
