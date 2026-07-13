import { useEffect, useState } from 'react'
import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'

interface Props { placeName: string; photos: Photo[]; isLoading: boolean; error: string | null }

export function PlacePopupGallery({ placeName, photos, isLoading, error }: Props) {
  const [index, setIndex] = useState(0); const [failed, setFailed] = useState(false)
  useEffect(() => { setIndex(0); setFailed(false) }, [photos])
  if (isLoading) return <div className="popup-photo-placeholder" role="status">Chargement des photos…</div>
  if (error) return <div className="popup-photo-placeholder" role="alert">Photos indisponibles</div>
  if (photos.length === 0) return <div className="popup-photo-placeholder">Aucune photo</div>
  const photo = photos[index]
  return <figure className="popup-gallery">
    {failed ? <div className="popup-photo-placeholder" role="img" aria-label={`Photo de ${placeName}`}>Image indisponible</div> : <img src={getPhotoFileUrl(photo.id)} alt={photo.description || `Photo de ${placeName}`} onError={() => setFailed(true)} />}
    {photos.length > 1 && <figcaption><button type="button" aria-label="Photo précédente" title="Photo précédente" onClick={() => { setFailed(false); setIndex((index - 1 + photos.length) % photos.length) }}>‹</button><span>{index + 1} / {photos.length}</span><button type="button" aria-label="Photo suivante" title="Photo suivante" onClick={() => { setFailed(false); setIndex((index + 1) % photos.length) }}>›</button></figcaption>}
  </figure>
}
