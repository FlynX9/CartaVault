import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { PoiMap } from '../../types/map'
import { withMap } from '../../utils/map'
import { CreateMapDialog } from '../maps/CreateMapDialog'
import { MapSelector } from '../maps/MapSelector'

interface TopBarProps {
  isMapWorkspace: boolean; maps: PoiMap[]; activeMapId: string | null; areMapsLoading: boolean; mapsError: string | null; markerCount: number; placeListOpen: boolean
  onMapChange: (mapId: string | null) => void; onMapCreated: (poiMap: PoiMap) => void; onDeleteMap: () => void; onTogglePlaceList: () => void
}

export function TopBar({ isMapWorkspace, maps, activeMapId, areMapsLoading, mapsError, markerCount, placeListOpen, onMapChange, onMapCreated, onDeleteMap, onTogglePlaceList }: TopBarProps) {
  const [creating, setCreating] = useState(false)
  return <header className="app-header">
    <div className="brand-block"><p className="app-eyebrow">{isMapWorkspace ? "Carte des points d'intérêt" : 'Administration'}</p><h1>POI Manager</h1></div>
    {isMapWorkspace && <MapSelector maps={maps} activeMapId={activeMapId} isLoading={areMapsLoading} errorMessage={mapsError} onChange={onMapChange} />}
    <nav className="app-header-actions" aria-label="Navigation principale">
      {isMapWorkspace && <>
        <button className="header-link" type="button" onClick={() => setCreating(true)}>Créer une carte</button>
        {activeMapId && <button className="header-link" type="button" onClick={onDeleteMap}>Supprimer la carte</button>}
        <button className="header-link place-list-toggle" type="button" aria-expanded={placeListOpen} aria-controls="map-place-list" onClick={onTogglePlaceList}>{placeListOpen ? 'Masquer la liste' : 'Afficher la liste'}</button>
        {activeMapId && <Link className="header-link" to={withMap('/places/new', activeMapId)}>Ajouter un POI</Link>}
      </>}
      <Link className="header-link" to="/admin/categories">Administration</Link>
      {isMapWorkspace ? <div className="marker-count" aria-live="polite"><strong>{markerCount}</strong><span>marqueur{markerCount > 1 ? 's' : ''}</span></div> : <Link className="header-link" to={withMap('/', activeMapId)}>Carte</Link>}
    </nav>
    {creating && <CreateMapDialog onClose={() => setCreating(false)} onCreated={(poiMap) => { setCreating(false); onMapCreated(poiMap) }} />}
  </header>
}
