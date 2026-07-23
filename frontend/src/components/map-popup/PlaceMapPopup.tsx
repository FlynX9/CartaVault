import { useEffect, useRef, useState } from 'react'
import { Copy, Heart, MapPin, Star } from 'lucide-react'
import { deletePlace, getPlaceDetails, updatePlace } from '../../api/places'
import { getPlacePhotos } from '../../api/photos'
import { geocodingService } from '../../geocoding/geocodingService'
import type { GeocodingResult } from '../../geocoding/types'
import type { Photo } from '../../types/photo'
import type { PlaceDetails } from '../../types/place'
import { buildGoogleMapsUrl } from '../../utils/googleMaps'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { PlacePopupActions } from './PlacePopupActions'
import { PlacePopupGallery } from './PlacePopupGallery'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { getTagColorStyle } from '../../tags/tagColors'

interface Props { placeId: string; canEdit?: boolean; onEdit: () => void; onDeleted: (placeId: string) => void; onClose: () => void }

function formatLocation(result: GeocodingResult | null, fallback: string | null): string | null {
  if (result?.locality) return [result.locality, result.postalCode].filter(Boolean).join(', ')
  return result?.formattedAddress || fallback
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
}

export function PlaceMapPopup({ placeId, canEdit = true, onEdit, onDeleted, onClose }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [place, setPlace] = useState<PlaceDetails | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [photosLoading, setPhotosLoading] = useState(true)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reverseLocation, setReverseLocation] = useState<GeocodingResult | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setDetailsLoading(true); setPhotosLoading(true); setDetailsError(null); setPhotosError(null); setReverseLocation(null)
    void getPlaceDetails(placeId, controller.signal).then(setPlace).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) setDetailsError(error instanceof Error ? error.message : 'POI indisponible.')
    }).finally(() => { if (!controller.signal.aborted) setDetailsLoading(false) })
    void getPlacePhotos(placeId, controller.signal).then(setPhotos).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) setPhotosError(error instanceof Error ? error.message : 'Photos indisponibles.')
    }).finally(() => { if (!controller.signal.aborted) setPhotosLoading(false) })
    return () => controller.abort()
  }, [placeId])

  useEffect(() => { if (place) titleRef.current?.focus() }, [place])

  useEffect(() => {
    if (place?.latitude == null || place.longitude == null) return
    const controller = new AbortController()
    void geocodingService.reverse(place.latitude, place.longitude, { signal: controller.signal }).then((results) => {
      if (!controller.signal.aborted) setReverseLocation(results[0] ?? null)
    }).catch(() => { if (!controller.signal.aborted) setReverseLocation(null) })
    return () => controller.abort()
  }, [place?.id, place?.latitude, place?.longitude])

  if (detailsLoading) return <div className="place-map-popup" role="status">Chargement du POI…</div>
  if (detailsError || !place) return <div className="place-map-popup popup-error" role="alert"><strong>Impossible d’afficher ce POI</strong><span>{detailsError}</span><button type="button" onClick={onClose}>Fermer</button></div>

  const googleUrl = buildGoogleMapsUrl(place.latitude, place.longitude)
  const coordinates = place.latitude !== null && place.longitude !== null ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}` : null
  const fieldEnabled = (field: string) => place.field_config?.[field] !== false
  const primaryCategory = place.categories.find((item) => item.is_primary)
  const displayLocation = formatLocation(reverseLocation, place.region)
  const isVisited = place.status.functional_state === 'visited'
  const rating = isVisited ? place.visit_rating : place.interest_rating
  const ratingLabel = isVisited ? 'Évaluation après visite' : 'Envie avant visite'
  const remove = async () => { if (!await confirm({ title: 'Supprimer ce lieu ?', message: `« ${place.name} » sera placé dans la corbeille.` })) return; setDeleting(true); try { await deletePlace(place.id); onDeleted(place.id) } catch (error) { setDetailsError(error instanceof Error ? error.message : 'Suppression impossible.'); setDeleting(false) } }
  const toggleFavorite = async () => { try { setPlace(await updatePlace(place.id, { is_favorite: !(place.is_favorite === true) })) } catch (error) { setDetailsError(error instanceof Error ? error.message : 'Modification du favori impossible.') } }

  return <article className="place-map-popup" aria-labelledby={`popup-title-${place.id}`}>
    <section className="popup-hero">
      <PlacePopupGallery placeName={place.name} photos={photos} isLoading={photosLoading} error={photosError} />
      <div className="popup-overview">
        <div className="popup-heading">
          <h2 id={`popup-title-${place.id}`} ref={titleRef} tabIndex={-1} title={place.name}><span className="popup-title-marker" style={{ backgroundColor: place.status.color }}><MapPin size={18} aria-hidden="true" /></span>{place.name}</h2>
          <div className="popup-heading-actions">
            {canEdit && fieldEnabled('favorite') && <button className={`popup-favorite${place.is_favorite ? ' active' : ''}`} type="button" aria-pressed={place.is_favorite === true} aria-label={place.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => void toggleFavorite()}><Heart size={17} fill={place.is_favorite ? 'currentColor' : 'none'} /></button>}
            <button className="popup-close" type="button" aria-label="Fermer la fiche" title="Fermer" onClick={onClose}>×</button>
          </div>
        </div>
        <p className="popup-primary-category">{primaryCategory ? <><CategoryIconPreview iconId={primaryCategory.icon} size={16} showLabel={false} />{primaryCategory.name}</> : 'Catégorie non renseignée'}</p>
        <section className="popup-overview-tag-section" aria-label="Tags"><span>Tags</span><ul className="popup-chips popup-overview-tags">{place.tags.length > 0 ? place.tags.slice(0, 3).map((item) => <li className="tag" key={item.id} style={getTagColorStyle(item.color)}>{item.name}</li>) : <li className="popup-empty-chip">Aucun tag</li>}{place.tags.length > 3 && <li className="tag popup-tag-more">+{place.tags.length - 3}</li>}</ul></section>
        {fieldEnabled('ratings') && <p className="popup-rating" style={{ color: place.status.color }} aria-label={rating !== null && rating !== undefined ? `${ratingLabel} : ${rating} sur 5` : `${ratingLabel} : aucune note`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={19} fill={rating !== null && rating !== undefined && star <= Math.round(rating) ? 'currentColor' : 'none'} />)}<strong>{rating !== null && rating !== undefined ? rating.toFixed(1) : 'Non noté'}</strong></p>}
      </div>
    </section>
    {detailsError && <p className="inline-error" role="alert">{detailsError}</p>}
    <div className="popup-location">
      <span>{displayLocation && <><MapPin size={17} aria-hidden="true" />{displayLocation}</>}</span>
      {coordinates && <button type="button" aria-label="Copier les coordonnées GPS" title="Copier les coordonnées" onClick={() => void navigator.clipboard?.writeText(coordinates)}><Copy size={17} aria-hidden="true" /></button>}
    </div>
    {fieldEnabled('description') && place.description && <section className="popup-description"><p>{place.description}</p></section>}
    <div className="popup-summary">
      {coordinates && <p><b>Coordonnées</b><span>{coordinates}</span></p>}
      {fieldEnabled('access') && <p><b>Accès</b><span><i className={`status-dot${place.access ? '' : ' neutral'}`} />{place.access || 'Non renseigné'}</span></p>}
      {fieldEnabled('danger_level') && <p><b>Danger</b><span><i className={`status-dot${place.danger_level ? ' warning' : ' neutral'}`} />{place.danger_level || 'Non renseigné'}</span></p>}
      <p><b>Ajouté le</b><span>{formatDate(place.created_at)}</span></p>
    </div>
    <PlacePopupActions googleMapsUrl={googleUrl} isDeleting={deleting} canEdit={canEdit} showClose={false} onEdit={onEdit} onDelete={() => void remove()} onClose={onClose} />
    {confirmationDialog}
  </article>
}
