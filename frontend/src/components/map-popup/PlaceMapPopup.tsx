import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Copy, FileText, Heart, History, LockKeyhole, MapPin, Star, TriangleAlert } from 'lucide-react'
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

function ratingFillPercentage(rating: number, star: number): number {
  return Math.max(0, Math.min(100, (rating - (star - 1)) * 100))
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
          <h2 id={`popup-title-${place.id}`} ref={titleRef} tabIndex={-1} title={place.name}>{place.name}</h2>
          <div className="popup-heading-actions">
            {canEdit && fieldEnabled('favorite') && <button className={`popup-favorite${place.is_favorite ? ' active' : ''}`} type="button" aria-pressed={place.is_favorite === true} aria-label={place.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => void toggleFavorite()}><Heart size={17} fill={place.is_favorite ? 'currentColor' : 'none'} /></button>}
            <button className="popup-close" type="button" aria-label="Fermer la fiche" title="Fermer" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="popup-overview-metadata">
          <section className="popup-overview-status-section" aria-label="Statut"><span>Statut</span><p><i className="status-dot" style={{ backgroundColor: place.status.color }} aria-hidden="true" />{place.status.name}</p></section>
          <section className="popup-overview-category-section" aria-label="Catégorie"><span>Catégorie</span><p className="popup-primary-category">{primaryCategory ? <><CategoryIconPreview iconId={primaryCategory.icon} size={16} showLabel={false} />{primaryCategory.name}</> : 'Non renseignée'}</p></section>
          <section className="popup-overview-tag-section" aria-label="Tags"><span>Tags</span><ul className="popup-chips popup-overview-tags">{place.tags.length > 0 ? place.tags.slice(0, 2).map((item) => <li className="tag" key={item.id} style={getTagColorStyle(item.color)}>{item.name}</li>) : <li className="popup-empty-chip">Aucun tag</li>}{place.tags.length > 2 && <li className="tag popup-tag-more">+{place.tags.length - 2}</li>}</ul></section>
        </div>
        {fieldEnabled('ratings') && <section className="popup-overview-rating-section" aria-label="Note"><span>Note</span><p className="popup-rating" style={{ color: place.status.color }} aria-label={rating !== null && rating !== undefined ? `${ratingLabel} : ${rating} sur 5` : `${ratingLabel} : aucune note`}>{[1, 2, 3, 4, 5].map((star) => {
          const fillPercentage = rating === null || rating === undefined ? 0 : ratingFillPercentage(rating, star)
          return <span className="popup-rating-star" data-fill={fillPercentage} key={star}><Star size={19} fill="none" /><span className="popup-rating-star-fill" style={{ width: `${fillPercentage}%` }}><Star size={19} fill="currentColor" /></span></span>
        })}<strong>{rating !== null && rating !== undefined ? rating.toFixed(1) : 'Non noté'}</strong></p></section>}
      </div>
    </section>
    {detailsError && <p className="inline-error" role="alert">{detailsError}</p>}
    {displayLocation && <div className="popup-location">
      <span><MapPin size={17} aria-hidden="true" />{displayLocation}</span>
    </div>}
    {fieldEnabled('description') && <section className="popup-description"><h3><FileText size={17} aria-hidden="true" />Description</h3><p>{place.description || '\u00A0'}</p></section>}
    <div className="popup-summary">
      {coordinates && <article aria-label="Coordonnées GPS"><MapPin aria-hidden="true" /><p><b>Coordonnées</b><span className="popup-summary-coordinate-row"><span>{coordinates}</span><button className="popup-summary-copy" type="button" aria-label="Copier les coordonnées GPS" title="Copier les coordonnées" onClick={() => void navigator.clipboard?.writeText(coordinates)}><Copy size={13} aria-hidden="true" /></button></span></p></article>}
      {fieldEnabled('access') && <article><LockKeyhole aria-hidden="true" /><p><b>Accès</b><span>{place.access || 'Non renseigné'}</span></p></article>}
      {fieldEnabled('danger_level') && <article className="popup-summary-danger"><TriangleAlert aria-hidden="true" /><p><b>Danger</b><span>{place.danger_level || 'Non renseigné'}</span></p></article>}
      <article><CalendarDays aria-hidden="true" /><p><b>Ajouté le</b><span>{formatDate(place.created_at)}</span></p></article>
      <article><History aria-hidden="true" /><p><b>Modifié le</b><span>{formatDate(place.updated_at)}</span></p></article>
    </div>
    <PlacePopupActions googleMapsUrl={googleUrl} isDeleting={deleting} canEdit={canEdit} showClose={false} onEdit={onEdit} onDelete={() => void remove()} onClose={onClose} />
    {confirmationDialog}
  </article>
}
