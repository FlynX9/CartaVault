import { Map, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { PoiMap } from '../../types/map'
import { CreateMapDialog } from './CreateMapDialog'

interface MapsWorkspacePanelProps {
  maps: PoiMap[]
  activeMapId: string | null
  isLoading: boolean
  errorMessage: string | null
  onOpen: (mapId: string) => void
  onDelete: (poiMap: PoiMap) => void
  onCreated: (poiMap: PoiMap) => void
  onClose: () => void
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()

export function MapsWorkspacePanel({ maps, activeMapId, isLoading, errorMessage, onOpen, onDelete, onCreated, onClose }: MapsWorkspacePanelProps) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const createButton = useRef<HTMLButtonElement>(null)
  const filteredMaps = useMemo(() => {
    const search = normalize(query.trim())
    return search === '' ? maps : maps.filter((poiMap) => normalize(`${poiMap.name} ${poiMap.country.name}`).includes(search))
  }, [maps, query])
  const closeCreateDialog = () => { setCreating(false); window.setTimeout(() => createButton.current?.focus(), 0) }

  return <aside id="workspace-maps-panel" className="country-place-panel workspace-management-panel cv-workspace-panel maps-workspace-panel" aria-labelledby="workspace-maps-title" tabIndex={-1}>
    <header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">Cartographie</p><h2 id="workspace-maps-title" className="cv-workspace-panel__title">Cartes</h2></div><div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{maps.length} carte{maps.length > 1 ? 's' : ''}</span><button ref={createButton} className="panel-icon-button primary" type="button" aria-label="Créer une carte" title="Créer une carte" onClick={() => setCreating(true)}><Plus size={18} /></button><button className="panel-icon-button" type="button" aria-label="Fermer le panneau" title="Fermer" onClick={onClose}><X size={18} /></button></div></header>
    <div className="maps-workspace-panel__content">
      <label className="workspace-search-field"><Search aria-hidden="true" size={17} /><span className="visually-hidden">Rechercher une carte</span><input type="search" placeholder="Rechercher une carte" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {errorMessage && <p className="form-alert" role="alert">{errorMessage}</p>}
      {isLoading && <p className="maps-panel-state" role="status">Chargement des cartes…</p>}
      {!isLoading && maps.length === 0 && <div className="maps-panel-empty"><p>Aucune carte créée.</p><button type="button" className="primary-button" onClick={() => setCreating(true)}>Créer une carte</button></div>}
      {!isLoading && maps.length > 0 && filteredMaps.length === 0 && <p className="place-list-message">Aucune carte ne correspond à la recherche.</p>}
      <ul className="maps-catalog" aria-label="Cartes disponibles">{filteredMaps.map((poiMap) => <li className={poiMap.id === activeMapId ? 'active' : ''} key={poiMap.id}>
        <div className="maps-catalog__preview" aria-label={`Aperçu de ${poiMap.name}`} role="img"><Map size={28} /><span>{poiMap.country.iso_alpha2}</span></div>
        <div className="maps-catalog__details"><strong>{poiMap.name}</strong><span>{poiMap.country.name}</span>{poiMap.id === activeMapId && <b>Ouverte</b>}</div>
        <div className="maps-catalog__actions"><button type="button" className="secondary-button" aria-label={`Ouvrir ${poiMap.name}`} onClick={() => onOpen(poiMap.id)}>Ouvrir</button><button type="button" className="panel-icon-button danger" aria-label={`Supprimer ${poiMap.name}`} title={`Supprimer ${poiMap.name}`} onClick={() => onDelete(poiMap)}><Trash2 size={16} /></button></div>
      </li>)}</ul>
    </div>
    {creating && <CreateMapDialog onClose={closeCreateDialog} onCreated={(poiMap) => { closeCreateDialog(); onCreated(poiMap) }} />}
  </aside>
}
