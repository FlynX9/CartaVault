import { ChevronRight, ClipboardCopy, Crosshair, ExternalLink, MapPin, Plus, Route, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { buildGoogleMapsUrl, formatContextCoordinates, type MapContextMenuState } from './mapContextMenuUtils'

interface TripDayOption { id: string; label: string }
interface Props { state: MapContextMenuState; canCreate?: boolean; tripDays?: TripDayOption[]; onClose: () => void; onCreate: () => void; onCopy: () => void; onAddToTripDay?: (dayId: string) => void }

export function MapContextMenu({ state, canCreate = true, tripDays = [], onClose, onCreate, onCopy, onAddToTripDay }: Props) {
  const firstAction = useRef<HTMLButtonElement>(null)
  const [daysOpen, setDaysOpen] = useState(false)
  useEffect(() => { firstAction.current?.focus() }, [])
  return <section className="map-context-menu" role="menu" aria-label="Actions à cet emplacement" style={{ left: `min(${state.containerX}px, calc(100% - 18.5rem))`, top: `min(${state.containerY}px, calc(100% - 15rem))` }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <header className="map-context-menu__header">
      <span className="map-context-menu__location-icon" aria-hidden="true"><Crosshair size={19} /></span>
      <strong>{formatContextCoordinates(state.latitude, state.longitude)}</strong>
      <button className="map-context-menu__close" type="button" aria-label="Fermer le menu" onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    {canCreate && <button ref={firstAction} className="map-context-menu__primary" type="button" role="menuitem" onClick={onCreate}><Plus size={17} aria-hidden="true" /><span>Créer un POI ici</span></button>}
    {tripDays.length > 0 && onAddToTripDay && <div className="map-context-menu__trip"><button ref={canCreate ? undefined : firstAction} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={daysOpen} onClick={() => setDaysOpen((value) => !value)}><Route size={17} aria-hidden="true" /><span>Ajouter au jour…</span><ChevronRight className={daysOpen ? 'expanded' : undefined} size={15} aria-hidden="true" /></button>{daysOpen && <div className="map-context-menu__days" role="menu" aria-label="Choisir une journée">{tripDays.map((day) => <button type="button" role="menuitem" key={day.id} onClick={() => onAddToTripDay(day.id)}>{day.label}</button>)}</div>}</div>}
    <button className="map-context-menu__action" type="button" role="menuitem" onClick={onCopy}><ClipboardCopy size={18} aria-hidden="true" /><span>Copier les coordonnées</span></button>
    <a className="map-context-menu__action map-context-menu__google" role="menuitem" href={buildGoogleMapsUrl(state.latitude, state.longitude)} target="_blank" rel="noopener noreferrer" onClick={onClose}><MapPin size={18} aria-hidden="true" /><span>Ouvrir dans Google Maps</span><ExternalLink className="map-context-menu__external" size={16} aria-hidden="true" /></a>
  </section>
}
