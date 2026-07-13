import { useState } from 'react'

import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'

interface PhotoGalleryProps {
  placeName: string
  photos: Photo[]
  isLoading: boolean
  errorMessage: string | null
}

function formatPhotoDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
  }).format(new Date(`${value}T00:00:00`))
}

export function PhotoGallery({
  placeName,
  photos,
  isLoading,
  errorMessage,
}: PhotoGalleryProps) {
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(new Set())

  if (isLoading) {
    return <p role="status">Chargement des photos…</p>
  }

  if (errorMessage !== null) {
    return (
      <div className="inline-error" role="alert">
        <strong>Les photos ne sont pas disponibles.</strong>
        <span>{errorMessage}</span>
      </div>
    )
  }

  if (photos.length === 0) {
    return <p className="empty-gallery">Aucune photo pour ce POI.</p>
  }

  return (
    <div className="photo-grid">
      {photos.map((photo) => {
        const imageFailed = failedPhotoIds.has(photo.id)
        const alternativeText = photo.description || `Photo de ${placeName}`

        return (
          <figure className="photo-card" key={photo.id}>
            {imageFailed ? (
              <div className="photo-unavailable" role="img" aria-label={alternativeText}>
                Image indisponible
              </div>
            ) : (
              <img
                src={getPhotoFileUrl(photo.id)}
                alt={alternativeText}
                loading="lazy"
                onError={() => {
                  setFailedPhotoIds((currentIds) => {
                    const nextIds = new Set(currentIds)
                    nextIds.add(photo.id)
                    return nextIds
                  })
                }}
              />
            )}
            <figcaption>
              {photo.description !== null && <p>{photo.description}</p>}
              <div className="photo-meta">
                {photo.original_name !== null && <span>{photo.original_name}</span>}
                {photo.taken_at !== null && (
                  <time dateTime={photo.taken_at}>
                    {formatPhotoDate(photo.taken_at)}
                  </time>
                )}
              </div>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}
