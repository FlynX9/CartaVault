import { MapPin, Trash2, X } from 'lucide-react'

import type { TripArrival, TripDeparture } from '../../types/trip'
import { GoogleMapsIcon } from '../common/GoogleMapsIcon'

interface Props {
  anchor: TripDeparture | TripArrival
  kind: 'departure' | 'arrival'
  canEdit: boolean
  onDelete: () => void
  onClose: () => void
}

const googleMapsUrl = (anchor: TripDeparture | TripArrival) => {
  const query = `${anchor.latitude},${anchor.longitude}`
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query }).toString()}`
}

export function TripAnchorMapPopup({ anchor, kind, canEdit, onDelete, onClose }: Props) {
  const label = kind === 'departure' ? 'Départ' : 'Arrivée'
  return <article className="place-map-popup trip-stop-map-popup trip-night-map-popup trip-anchor-map-popup" aria-labelledby={`trip-anchor-popup-title-${anchor.id}`}>
    <header>
      <div><span>{label}</span><h2 id={`trip-anchor-popup-title-${anchor.id}`}>{anchor.name}</h2></div>
      <button type="button" aria-label={`Fermer la fiche du point d${kind === 'departure' ? 'e départ' : '’arrivée'}`} title="Fermer" onClick={onClose}><X aria-hidden="true" size={15} /></button>
    </header>
    {anchor.address && <p className="trip-night-map-popup__address"><MapPin aria-hidden="true" size={15} /><span>{anchor.address}</span></p>}
    {anchor.notes && <section className="trip-night-map-popup__description"><strong>Notes</strong><p>{anchor.notes}</p></section>}
    <footer className="popup-actions">
      <a href={googleMapsUrl(anchor)} target="_blank" rel="noreferrer"><GoogleMapsIcon size={15} /><span>Google Maps</span></a>
      {canEdit && <button className="danger-button" type="button" onClick={onDelete}><Trash2 aria-hidden="true" size={15} /><span>Supprimer</span></button>}
    </footer>
  </article>
}
