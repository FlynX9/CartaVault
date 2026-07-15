import { Fragment, useEffect, useRef, useState } from 'react'
import { deletePlace, getPlaceDetails } from '../../api/places'
import { getPlacePhotos } from '../../api/photos'
import type { Photo } from '../../types/photo'
import type { PlaceDetails } from '../../types/place'
import { buildGoogleMapsUrl } from '../../utils/googleMaps'
import { PlacePopupActions } from './PlacePopupActions'
import { PlacePopupGallery } from './PlacePopupGallery'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

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
  const coordinates = place.latitude !== null && place.longitude !== null ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : null
  const remove = async () => { if (!window.confirm(`Supprimer « ${place.name} » ?`)) return; setDeleting(true); try { await deletePlace(place.id); onDeleted(place.id) } catch (error) { setDetailsError(error instanceof Error ? error.message : 'Suppression impossible.'); setDeleting(false) } }
  return <article className="place-map-popup" aria-labelledby={`popup-title-${place.id}`}>
    <PlacePopupGallery placeName={place.name} photos={photos} isLoading={photosLoading} error={photosError} />
    <div className="popup-heading"><div><p>{place.map.name} · {place.map.country.name}</p><h2 id={`popup-title-${place.id}`} ref={titleRef} tabIndex={-1}>{place.name}</h2></div></div>
    <div className="popup-summary"><p><b>Statut</b><span><i className="status-dot" style={{ backgroundColor: place.status.color }} />{place.status.name}</span></p>{place.categories.find((item) => item.is_primary) && <p><b>Catégorie</b><span><CategoryIconPreview iconId={place.categories.find((item) => item.is_primary)?.icon} size={16} showLabel={false} />{place.categories.find((item) => item.is_primary)?.name}</span></p>}</div>
    {detailsError && <p className="inline-error" role="alert">{detailsError}</p>}
    <dl className="popup-details">{place.condition && <><dt>État</dt><dd>{place.condition}</dd></>}{place.access && <><dt>Accès</dt><dd>{place.access}</dd></>}{place.danger_level && <><dt>Danger</dt><dd>{place.danger_level}</dd></>}{place.construction_date && <><dt>Construction</dt><dd>{place.construction_date}</dd></>}{place.abandonment_date && <><dt>Abandon</dt><dd>{place.abandonment_date}</dd></>}</dl>
    {place.description && <section className="popup-description"><h3>Description</h3><p>{place.description}</p></section>}
    {place.tags.length > 0 && <section className="popup-tags"><h3>Tags</h3><ul className="popup-chips">{place.tags.map((item) => <li className="tag" key={item.id}>{item.name}</li>)}</ul></section>}
    {place.custom_fields && Object.keys(place.custom_fields).length > 0 && <section className="popup-imported-data"><h3>Données importées</h3><dl className="popup-details">{Object.entries(place.custom_fields).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></Fragment>)}</dl></section>}
    {coordinates && <div className="popup-coordinates"><button type="button" aria-label="Copier les coordonnées GPS" title="Copier les coordonnées" onClick={() => void navigator.clipboard?.writeText(coordinates)}>{coordinates}</button></div>}
    <PlacePopupActions googleMapsUrl={googleUrl} isDeleting={deleting} onEdit={onEdit} onDelete={() => void remove()} onClose={onClose} />
  </article>
}
