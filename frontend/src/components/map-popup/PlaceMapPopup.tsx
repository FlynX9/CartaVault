import { useEffect, useRef, useState } from 'react'
import { deletePlace, getPlaceDetails } from '../../api/places'
import { getPlacePhotos } from '../../api/photos'
import type { Photo } from '../../types/photo'
import type { PlaceDetails } from '../../types/place'
import { buildGoogleMapsUrl } from '../../utils/googleMaps'
import { PlacePopupActions } from './PlacePopupActions'
import { PlacePopupGallery } from './PlacePopupGallery'

interface Props { placeId: string; onEdit: () => void; onDeleted: (placeId: string) => void; onClose: () => void }

export function PlaceMapPopup({ placeId, onEdit, onDeleted, onClose }: Props) {
  const [place, setPlace] = useState<PlaceDetails | null>(null); const [photos, setPhotos] = useState<Photo[]>([])
  const [detailsLoading, setDetailsLoading] = useState(true); const [photosLoading, setPhotosLoading] = useState(true)
  const [detailsError, setDetailsError] = useState<string | null>(null); const [photosError, setPhotosError] = useState<string | null>(null); const [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { const controller = new AbortController(); setDetailsLoading(true); setPhotosLoading(true); setDetailsError(null); setPhotosError(null)
    void getPlaceDetails(placeId, controller.signal).then(setPlace).catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setDetailsError(error instanceof Error ? error.message : 'POI indisponible.') }).finally(() => { if (!controller.signal.aborted) setDetailsLoading(false) })
    void getPlacePhotos(placeId, controller.signal).then(setPhotos).catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setPhotosError(error instanceof Error ? error.message : 'Photos indisponibles.') }).finally(() => { if (!controller.signal.aborted) setPhotosLoading(false) })
    return () => controller.abort()
  }, [placeId])
  useEffect(() => { if (place) titleRef.current?.focus() }, [place])
  if (detailsLoading) return <div className="place-map-popup" role="status">Chargement du POI…</div>
  if (detailsError || !place) return <div className="place-map-popup popup-error" role="alert"><strong>Impossible d’afficher ce POI</strong><span>{detailsError}</span><button type="button" onClick={onClose}>Fermer</button></div>
  const googleUrl = buildGoogleMapsUrl(place.latitude, place.longitude)
  const remove = async () => { if (!window.confirm(`Supprimer « ${place.name} » ?`)) return; setDeleting(true); try { await deletePlace(place.id); onDeleted(place.id) } catch (error) { setDetailsError(error instanceof Error ? error.message : 'Suppression impossible.'); setDeleting(false) } }
  return <article className="place-map-popup" aria-labelledby={`popup-title-${place.id}`}>
    <PlacePopupGallery placeName={place.name} photos={photos} isLoading={photosLoading} error={photosError} />
    <div className="popup-heading"><div><p>{place.map.name} · {place.map.country.name}</p><h2 id={`popup-title-${place.id}`} ref={titleRef} tabIndex={-1}>{place.name}</h2></div><PlacePopupActions googleMapsUrl={googleUrl} isDeleting={deleting} onEdit={onEdit} onDelete={() => void remove()} onClose={onClose} /></div>
    <p className="place-status-label"><span className="status-dot" style={{ backgroundColor: place.status.color }} />Statut : {place.status.name}</p>
    {detailsError && <p className="inline-error" role="alert">{detailsError}</p>}
    {place.description && <p className="popup-description">{place.description}</p>}
    {(place.categories.length > 0 || place.tags.length > 0) && <ul className="popup-chips">{place.categories.map((item) => <li key={item.id}>{item.name}</li>)}{place.tags.map((item) => <li className="tag" key={item.id}>{item.name}</li>)}</ul>}
    <dl className="popup-details">{place.condition && <><dt>État</dt><dd>{place.condition}</dd></>}{place.access && <><dt>Accès</dt><dd>{place.access}</dd></>}{place.danger_level && <><dt>Danger</dt><dd>{place.danger_level}</dd></>}{place.construction_date && <><dt>Construction</dt><dd>{place.construction_date}</dd></>}{place.abandonment_date && <><dt>Abandon</dt><dd>{place.abandonment_date}</dd></>}</dl>
    {place.latitude !== null && place.longitude !== null && <p className="popup-coordinates">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>}
  </article>
}
