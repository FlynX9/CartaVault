import { useEffect, useRef, useState } from 'react'
import { ExternalLink, ImagePlus, MapPin, Save, Trash2, X } from 'lucide-react'

import { deleteTripNightPhoto, tripNightPhotoUrl, updateTripNight, uploadTripNightPhoto } from '../../api/trips'
import type { TripNight } from '../../types/trip'

interface Props {
  night: TripNight
  canEdit: boolean
  onUpdated: (night: TripNight) => void
  onClose: () => void
}

export function TripNightMapPopup({ night, canEdit, onUpdated, onClose }: Props) {
  const [description, setDescription] = useState(night.description ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => setDescription(night.description ?? ''), [night.description, night.id])

  const run = async (action: () => Promise<TripNight>) => {
    setPending(true)
    setError(null)
    try { onUpdated(await action()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de mettre à jour cette nuit.') }
    finally { setPending(false) }
  }

  return <article className="place-map-popup trip-stop-map-popup trip-night-map-popup" aria-labelledby={`trip-night-popup-title-${night.id}`}>
    <header>
      <div><span>Nuit</span><h2 id={`trip-night-popup-title-${night.id}`}>{night.name}</h2></div>
      <button type="button" aria-label="Fermer la fiche de la nuit" title="Fermer" onClick={onClose}><X aria-hidden="true" size={15} /></button>
    </header>
    {night.photo_id ? <img className="trip-night-map-popup__photo" src={tripNightPhotoUrl(night.id, night.photo_id)} alt={`Photo de ${night.name}`} /> : <div className="trip-night-map-popup__photo trip-night-map-popup__photo--empty"><ImagePlus aria-hidden="true" /><span>Aucune photo</span></div>}
    {night.address && <p className="trip-night-map-popup__address"><MapPin aria-hidden="true" size={15} /><span>{night.address}</span></p>}
    <section className="trip-night-map-popup__description">
      <label htmlFor={`trip-night-description-${night.id}`}>Description</label>
      {canEdit ? <textarea id={`trip-night-description-${night.id}`} value={description} placeholder="Ajoutez une description de l’hébergement…" maxLength={10000} onChange={(event) => setDescription(event.target.value)} /> : <p>{description || 'Aucune description.'}</p>}
    </section>
    {error && <p className="trip-night-map-popup__error" role="alert">{error}</p>}
    <footer className="popup-actions">
      {canEdit && <>
        <input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => uploadTripNightPhoto(night.id, file)) }} />
        <button type="button" disabled={pending} onClick={() => fileInput.current?.click()}><ImagePlus aria-hidden="true" size={15} /><span>{night.photo_id ? 'Remplacer' : 'Ajouter une photo'}</span></button>
        {night.photo_id && <button className="popup-action-delete" type="button" disabled={pending} onClick={() => void run(() => deleteTripNightPhoto(night.id))}><Trash2 aria-hidden="true" size={15} /><span>Supprimer la photo</span></button>}
        <button type="button" disabled={pending || description === (night.description ?? '')} onClick={() => void run(() => updateTripNight(night.id, { description: description.trim() || null }))}><Save aria-hidden="true" size={15} /><span>Enregistrer</span></button>
      </>}
      {night.google_place_id && <a href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(night.google_place_id)}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={15} /><span>Google Maps</span></a>}
    </footer>
  </article>
}
