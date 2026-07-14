import { useEffect, useRef } from 'react'

import { buildGoogleMapsUrl, formatContextCoordinates, type MapContextMenuState } from './mapContextMenuUtils'

interface Props { state: MapContextMenuState; onClose: () => void; onCreate: () => void; onCopy: () => void }
export function MapContextMenu({ state, onClose, onCreate, onCopy }: Props) {
  const firstAction = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstAction.current?.focus() }, [])
  return <section className="map-context-menu" role="menu" aria-label="Actions à cet emplacement" style={{ left: `min(${state.containerX}px, calc(100% - 13rem))`, top: `min(${state.containerY}px, calc(100% - 12rem))` }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <strong>{formatContextCoordinates(state.latitude, state.longitude)}</strong>
    <button ref={firstAction} type="button" role="menuitem" onClick={onCreate}>Créer un POI ici</button>
    <button type="button" role="menuitem" onClick={onCopy}>Copier les coordonnées</button>
    <a role="menuitem" href={buildGoogleMapsUrl(state.latitude, state.longitude)} target="_blank" rel="noopener noreferrer" onClick={onClose}>Ouvrir dans Google Maps</a>
    <button type="button" role="menuitem" onClick={onClose}>Fermer</button>
  </section>
}
