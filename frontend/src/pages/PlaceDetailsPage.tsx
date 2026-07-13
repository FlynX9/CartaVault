import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { getPlacePhotos } from '../api/photos'
import { deletePlace, getPlaceDetails } from '../api/places'
import { PhotoGallery } from '../components/photos/PhotoGallery'
import type { Photo } from '../types/photo'
import type { PlaceDetails } from '../types/place'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
  }).format(new Date(value))
}

interface DetailItemProps {
  label: string
  value: string
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface PlaceDetailsPageProps {
  onPlaceDeleted?: (placeId: string) => void
}

export function PlaceDetailsPage({ onPlaceDeleted }: PlaceDetailsPageProps) {
  const { placeId } = useParams<{ placeId: string }>()
  const navigate = useNavigate()
  const [place, setPlace] = useState<PlaceDetails | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isPlaceLoading, setIsPlaceLoading] = useState(true)
  const [isPhotosLoading, setIsPhotosLoading] = useState(true)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (placeId === undefined) {
      setPlaceError("L'identifiant du POI est absent de l'URL.")
      setIsPlaceLoading(false)
      return
    }

    const controller = new AbortController()
    setIsPlaceLoading(true)
    setPlaceError(null)
    setIsNotFound(false)

    void getPlaceDetails(placeId, controller.signal)
      .then(setPlace)
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return
        }

        setPlace(null)

        if (error instanceof ApiError && error.status === 404) {
          setIsNotFound(true)
          return
        }

        setPlaceError(
          error instanceof Error
            ? error.message
            : "Une erreur inattendue empêche le chargement du POI.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPlaceLoading(false)
        }
      })

    return () => controller.abort()
  }, [placeId])

  useEffect(() => {
    if (placeId === undefined) {
      setIsPhotosLoading(false)
      return
    }

    const controller = new AbortController()
    setIsPhotosLoading(true)
    setPhotosError(null)

    void getPlacePhotos(placeId, controller.signal)
      .then(setPhotos)
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return
        }

        setPhotos([])
        setPhotosError(
          error instanceof Error
            ? error.message
            : "Une erreur inattendue empêche le chargement des photos.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPhotosLoading(false)
        }
      })

    return () => controller.abort()
  }, [placeId])

  if (isPlaceLoading) {
    return (
      <section className="details-state" role="status">
        <span className="loading-dot" aria-hidden="true" />
        Chargement de la fiche…
      </section>
    )
  }

  if (isNotFound) {
    return (
      <section className="details-state details-error">
        <p className="details-kicker">Erreur 404</p>
        <h2>POI introuvable</h2>
        <p>Ce point d'intérêt n'existe pas ou a été supprimé.</p>
        <Link className="back-link" to="/">
          ← Retour à la carte
        </Link>
      </section>
    )
  }

  if (placeError !== null || place === null) {
    return (
      <section className="details-state details-error" role="alert">
        <h2>Impossible d'afficher ce POI</h2>
        <p>{placeError ?? 'La réponse du serveur est incomplète.'}</p>
        <Link className="back-link" to="/">
          ← Retour à la carte
        </Link>
      </section>
    )
  }

  const hasLocation = place.region !== null || place.country !== null
  const hasPracticalDetails =
    place.condition !== null ||
    place.access !== null ||
    place.danger_level !== null
  const hasChronology =
    place.construction_date !== null || place.abandonment_date !== null

  const handleDelete = async () => {
    if (
      placeId === undefined ||
      !window.confirm(`Supprimer « ${place.name} » ?`)
    ) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deletePlace(placeId)
      onPlaceDeleted?.(placeId)
      navigate('/')
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'La suppression a échoué.',
      )
      setIsDeleting(false)
    }
  }

  return (
    <article className="details-page">
      <div className="details-toolbar">
        <Link className="back-link" to="/">
          ← Retour à la carte
        </Link>
        <div className="details-actions">
          <Link className="secondary-button" to={`/places/${place.id}/edit`}>
            Modifier
          </Link>
          <button
            className="danger-button"
            type="button"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>

      {deleteError && (
        <div className="form-alert" role="alert">
          {deleteError}
        </div>
      )}

      <header className="details-hero">
        <p className="details-kicker">Point d'intérêt</p>
        <h2>{place.name}</h2>
        {place.description !== null && (
          <p className="details-description">{place.description}</p>
        )}
        {place.latitude !== null && place.longitude !== null && (
          <p className="details-coordinates">
            {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
          </p>
        )}
      </header>

      <div className="details-content">
        <div className="details-main-column">
          {hasLocation && (
            <section className="details-section">
              <h3>Localisation</h3>
              <dl className="details-list">
                {place.region !== null && (
                  <DetailItem label="Région" value={place.region} />
                )}
                {place.country !== null && (
                  <DetailItem label="Pays" value={place.country} />
                )}
              </dl>
            </section>
          )}

          {(place.categories.length > 0 || place.tags.length > 0) && (
            <section className="details-section">
              <h3>Classement</h3>
              {place.categories.length > 0 && (
                <div className="classification-group">
                  <h4>Catégories</h4>
                  <ul className="chip-list">
                    {place.categories.map((category) => (
                      <li className="chip" key={category.id}>
                        {category.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {place.tags.length > 0 && (
                <div className="classification-group">
                  <h4>Tags</h4>
                  <ul className="chip-list">
                    {place.tags.map((tag) => (
                      <li className="chip tag" key={tag.id}>
                        {tag.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {hasPracticalDetails && (
            <section className="details-section">
              <h3>Informations pratiques</h3>
              <dl className="details-list">
                {place.condition !== null && (
                  <DetailItem label="État" value={place.condition} />
                )}
                {place.access !== null && (
                  <DetailItem label="Accès" value={place.access} />
                )}
                {place.danger_level !== null && (
                  <DetailItem label="Danger" value={place.danger_level} />
                )}
              </dl>
            </section>
          )}

          {hasChronology && (
            <section className="details-section">
              <h3>Chronologie</h3>
              <dl className="details-list">
                {place.construction_date !== null && (
                  <DetailItem
                    label="Construction"
                    value={place.construction_date}
                  />
                )}
                {place.abandonment_date !== null && (
                  <DetailItem
                    label="Abandon"
                    value={place.abandonment_date}
                  />
                )}
              </dl>
            </section>
          )}

          <section className="details-section photos-section">
            <h3>Photos</h3>
            <PhotoGallery
              placeName={place.name}
              photos={photos}
              isLoading={isPhotosLoading}
              errorMessage={photosError}
            />
          </section>
        </div>

        <aside className="details-metadata" aria-label="Métadonnées du POI">
          <span>Créé le {formatDateTime(place.created_at)}</span>
          <span>Mis à jour le {formatDateTime(place.updated_at)}</span>
        </aside>
      </div>
    </article>
  )
}
