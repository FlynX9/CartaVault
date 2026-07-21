import { TileLayer } from 'react-leaflet'

import { getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapLayerProps {
  basemapId: BasemapId
  onTileError: (id: BasemapId) => void
}

/** The map keeps a single active tile layer; changing its key never recreates MapContainer. */
export function BasemapLayer({ basemapId, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)

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
