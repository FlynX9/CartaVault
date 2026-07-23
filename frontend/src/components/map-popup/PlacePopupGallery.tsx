import { Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PhotoViewer } from '../photos/PhotoViewer'
import { photoViewerMessages } from '../photos/photoViewerI18n'

interface Props {
  placeName: string
  photos: Photo[]
  isLoading: boolean
  error: string | null
}

export function PlacePopupGallery({ placeName, photos, isLoading, error }: Props) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const orderedPhotos = useMemo(
    () => [...photos].sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    [photos],
  )
  const t = photoViewerMessages()

  useEffect(() => {
    setIndex(0)
    setFailed(false)
    setViewerOpen(false)
  }, [photos])

  if (isLoading) return <div className="popup-photo-placeholder" role="status">Chargement des photos…</div>
  if (error) return <div className="popup-photo-placeholder" role="alert">Photos indisponibles</div>
  if (orderedPhotos.length === 0) return <div className="popup-photo-placeholder">Aucune photo</div>

  const photo = orderedPhotos[index]
  const alternativeText = photo.description || `Photo de ${placeName}`

  return (
    <figure className="popup-gallery">
      {failed ? (
        <div className="popup-photo-placeholder" role="img" aria-label={alternativeText}>Image indisponible</div>
      ) : (
        <button className="popup-gallery__open" type="button" aria-label={`${t.view} — ${alternativeText}`} onClick={() => setViewerOpen(true)}>
          <img src={getPhotoFileUrl(photo.id)} alt={alternativeText} onError={() => setFailed(true)} />
          <span><Maximize2 aria-hidden="true" size={15} /></span>
        </button>
      )}
      {orderedPhotos.length > 1 && (
        <figcaption>
          <button type="button" disabled={index === 0} aria-label="Photo précédente" title="Photo précédente" onClick={() => { setFailed(false); setIndex(index - 1) }}>‹</button>
          <span>{index + 1} / {orderedPhotos.length}</span>
          <button type="button" disabled={index === orderedPhotos.length - 1} aria-label="Photo suivante" title="Photo suivante" onClick={() => { setFailed(false); setIndex(index + 1) }}>›</button>
        </figcaption>
      )}
      {viewerOpen && <PhotoViewer photos={orderedPhotos} placeName={placeName} initialPhotoId={photo.id} onClose={() => setViewerOpen(false)} />}
    </figure>
  )
}
