import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import type { PoiMap } from '../../types/map'
import { CreateMapDialog } from '../maps/CreateMapDialog'
import { MapSelector } from '../maps/MapSelector'

interface TopBarProps { isMapWorkspace: boolean; maps: PoiMap[]; activeMapId: string | null; areMapsLoading: boolean; mapsError: string | null; markerCount: number; onMapChange: (mapId: string | null) => void; onMapCreated: (poiMap: PoiMap) => void; onDeleteMap: () => void }

export function TopBar({ isMapWorkspace, maps, activeMapId, areMapsLoading, mapsError, markerCount, onMapChange, onMapCreated, onDeleteMap }: TopBarProps) {
  const [creating, setCreating] = useState(false)
  const createMapButton = useRef<HTMLButtonElement>(null)
  const closeCreateMapDialog = () => { setCreating(false); window.setTimeout(() => createMapButton.current?.focus(), 0) }
  return <header className="app-header"><div className="brand-block"><p className="app-eyebrow">{isMapWorkspace ? 'Espace cartographique' : 'Administration'}</p><h1 className="cartavault-wordmark"><span>Carta</span><strong>Vault</strong></h1></div>{isMapWorkspace && <div className="map-selector-actions"><MapSelector maps={maps} activeMapId={activeMapId} isLoading={areMapsLoading} errorMessage={mapsError} onChange={onMapChange} /><button ref={createMapButton} className="map-action-button" type="button" aria-label="Créer une carte" title="Créer une carte" onClick={() => setCreating(true)}><Plus size={20} /></button><button className="map-action-button danger" type="button" aria-label="Supprimer la carte" title="Supprimer la carte sélectionnée" disabled={!activeMapId} onClick={onDeleteMap}><Trash2 size={20} /></button></div>}<nav className="app-header-actions" aria-label="Navigation principale">{isMapWorkspace && <div className="marker-count" aria-live="polite"><strong>{markerCount}</strong><span>marqueur{markerCount > 1 ? 's' : ''}</span></div>}</nav>{creating && <CreateMapDialog onClose={closeCreateMapDialog} onCreated={(poiMap) => { closeCreateMapDialog(); onMapCreated(poiMap) }} />}</header>
}
