import { useState } from 'react'
import { Maximize2 } from 'lucide-react'

import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PhotoViewer } from './PhotoViewer'
import { photoViewerMessages } from './photoViewerI18n'

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
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null)
  const t = photoViewerMessages()

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
              <button className="photo-card__open" type="button" aria-label={`${t.view} — ${alternativeText}`} onClick={() => setViewerPhotoId(photo.id)}>
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
                <span><Maximize2 aria-hidden="true" size={16} />{t.view}</span>
              </button>
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
      {viewerPhotoId && <PhotoViewer photos={photos} placeName={placeName} initialPhotoId={viewerPhotoId} onClose={() => setViewerPhotoId(null)} />}
    </div>
  )
}
