import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { getPlacePhotos } from '../api/photos'
import { deletePlace, getPlaceDetails } from '../api/places'
import { PhotoGallery } from '../components/photos/PhotoGallery'
import type { Photo } from '../types/photo'
import type { PlaceDetails } from '../types/place'
import { buildGoogleMapsUrl } from '../utils/googleMaps'
import { withMap } from '../utils/map'
import { useConfirmDialog } from '../components/common/useConfirmDialog'
import { getTagColorStyle } from '../tags/tagColors'

interface Props { placeId?: string; embedded?: boolean; activeMapId?: string | null; onPlaceDeleted?: (placeId: string) => void }
const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError'
const formatDate = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(value))

export function PlaceDetailsPage({ placeId: providedPlaceId, embedded = false, activeMapId = null, onPlaceDeleted }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const { placeId: routePlaceId } = useParams<{ placeId: string }>(); const placeId = providedPlaceId ?? routePlaceId; const navigate = useNavigate()
  const [place, setPlace] = useState<PlaceDetails | null>(null); const [photos, setPhotos] = useState<Photo[]>([]); const [loading, setLoading] = useState(true); const [photosLoading, setPhotosLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [photosError, setPhotosError] = useState<string | null>(null); const [notFound, setNotFound] = useState(false); const [deleteError, setDeleteError] = useState<string | null>(null)
  useEffect(() => { if (!placeId) { setError('Identifiant absent.'); setLoading(false); return }; const controller = new AbortController(); void getPlaceDetails(placeId, controller.signal).then(setPlace).catch((caught: unknown) => { if (caught instanceof ApiError && caught.status === 404) setNotFound(true); else if (!isAbortError(caught)) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); setPhotosLoading(true); setPhotosError(null); void getPlacePhotos(placeId, controller.signal).then(setPhotos).catch((caught: unknown) => { if (!isAbortError(caught)) { setPhotos([]); setPhotosError(caught instanceof Error ? caught.message : 'Photos indisponibles.') } }).finally(() => { if (!controller.signal.aborted) setPhotosLoading(false) }); return () => controller.abort() }, [placeId])
  if (loading) return <section className="details-state" role="status">Chargement de la fiche…</section>
  if (notFound) return <section className="details-state details-error"><h2>POI introuvable</h2><Link to={withMap('/', activeMapId)}>← Retour à la carte</Link></section>
  if (!place) return <section className="details-state details-error" role="alert"><h2>Impossible d’afficher ce POI</h2><p>{error}</p></section>
  const externalUrl = buildGoogleMapsUrl(place.latitude, place.longitude)
  const remove = async () => { if (!placeId || !await confirm({ title: 'Supprimer ce lieu ?', message: `« ${place.name} » sera placé dans la corbeille.` })) return; try { await deletePlace(placeId); onPlaceDeleted?.(placeId); navigate(withMap('/', activeMapId)) } catch (caught) { setDeleteError(caught instanceof Error ? caught.message : 'Suppression impossible.') } }
  return <article className={`details-page${embedded ? ' embedded' : ''}`}>
    <div className="details-toolbar">{!embedded && <Link className="back-link" to={withMap('/', activeMapId)}>← Retour à la carte</Link>}<div className="details-actions"><Link className="secondary-button" to={withMap(`/places/${place.id}/edit`, activeMapId)}>Modifier</Link><button className="danger-button" type="button" onClick={() => void remove()}>Supprimer</button></div></div>
    {deleteError && <div className="form-alert" role="alert">{deleteError}</div>}
    <header className="details-hero"><p className="details-kicker">Point d’intérêt</p><h2>{place.name}</h2>{place.description && <p>{place.description}</p>}{place.latitude !== null && place.longitude !== null && <p>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>}{externalUrl && <a className="external-map-link" href={externalUrl} target="_blank" rel="noopener noreferrer">Ouvrir dans Google Maps</a>}</header>
    <div className="details-content"><div className="details-main-column">
      <section className="details-section"><h3>Localisation</h3><dl className="details-list"><div className="detail-item"><dt>Carte</dt><dd>{place.map.name}</dd></div><div className="detail-item"><dt>Pays</dt><dd>{place.map.country.name}</dd></div>{place.region && <div className="detail-item"><dt>Région</dt><dd>{place.region}</dd></div>}</dl></section>
      {(place.categories.length > 0 || place.tags.length > 0) && <section className="details-section"><h3>Classement</h3><ul className="chip-list">{place.categories.map((item) => <li className="chip" key={item.id}>{item.name}</li>)}{place.tags.map((item) => <li className="chip tag" key={item.id} style={getTagColorStyle(item.color)}>{item.name}</li>)}</ul></section>}
      {(place.condition || place.access || place.danger_level) && <section className="details-section"><h3>Informations pratiques</h3><dl className="details-list">{place.condition && <div className="detail-item"><dt>État</dt><dd>{place.condition}</dd></div>}{place.access && <div className="detail-item"><dt>Accès</dt><dd>{place.access}</dd></div>}{place.danger_level && <div className="detail-item"><dt>Danger</dt><dd>{place.danger_level}</dd></div>}</dl></section>}
      {(place.construction_date || place.abandonment_date) && <section className="details-section"><h3>Chronologie</h3><dl className="details-list">{place.construction_date && <div className="detail-item"><dt>Construction</dt><dd>{place.construction_date}</dd></div>}{place.abandonment_date && <div className="detail-item"><dt>Abandon</dt><dd>{place.abandonment_date}</dd></div>}</dl></section>}
      <section className="details-section photos-section"><h3>Photos</h3><PhotoGallery placeName={place.name} photos={photos} isLoading={photosLoading} errorMessage={photosError} /></section>
    </div><aside className="details-metadata"><span>Créé le {formatDate(place.created_at)}</span><span>Mis à jour le {formatDate(place.updated_at)}</span></aside></div>{confirmationDialog}
  </article>
}
