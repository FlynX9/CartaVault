import { MapPin, X } from 'lucide-react'

import type { TripStop } from '../../types/trip'

interface Props {
  stop: TripStop
  onClose: () => void
}

export function TripStopMapPopup({ stop, onClose }: Props) {
  return <article className="place-map-popup trip-stop-map-popup" aria-labelledby={`trip-stop-popup-title-${stop.id}`}>
    <header>
      <h2 id={`trip-stop-popup-title-${stop.id}`}>{stop.name}</h2>
      <button type="button" aria-label="Fermer la fiche de l’étape" title="Fermer" onClick={onClose}><X aria-hidden="true" size={15} /></button>
    </header>
    {stop.address && <p><MapPin aria-hidden="true" size={15} /><span>{stop.address}</span></p>}
  </article>
}
