import { ClipboardCopy, MapPinned, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { buildGoogleMapsUrl, formatContextCoordinates, type MapContextMenuState } from './mapContextMenuUtils'

interface Props { state: MapContextMenuState; canCreate?: boolean; onClose: () => void; onCreate: () => void; onCopy: () => void }

export function MapContextMenu({ state, canCreate = true, onClose, onCreate, onCopy }: Props) {
  const firstAction = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstAction.current?.focus() }, [])
  return <section className="map-context-menu" role="menu" aria-label="Actions à cet emplacement" style={{ left: `min(${state.containerX}px, calc(100% - 13rem))`, top: `min(${state.containerY}px, calc(100% - 12rem))` }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <strong>{formatContextCoordinates(state.latitude, state.longitude)}</strong>
    {canCreate && <button ref={firstAction} className="map-context-menu__primary" type="button" role="menuitem" onClick={onCreate}><Plus size={17} aria-hidden="true" /><span>Créer un POI ici</span></button>}
    <button type="button" role="menuitem" onClick={onCopy}><ClipboardCopy size={17} aria-hidden="true" /><span>Copier les coordonnées</span></button>
    <a role="menuitem" href={buildGoogleMapsUrl(state.latitude, state.longitude)} target="_blank" rel="noopener noreferrer" onClick={onClose}><MapPinned size={17} aria-hidden="true" /><span>Ouvrir dans Google Maps</span></a>
  </section>
}
