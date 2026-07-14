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
  const orderedPhotos = [...photos].sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order)
  const photo = orderedPhotos[index]
  return <figure className="popup-gallery">
    {failed ? <div className="popup-photo-placeholder" role="img" aria-label={`Photo de ${placeName}`}>Image indisponible</div> : <img src={getPhotoFileUrl(photo.id)} alt={photo.description || `Photo de ${placeName}`} onError={() => setFailed(true)} />}
    {orderedPhotos.length > 1 && <figcaption><button type="button" aria-label="Photo précédente" title="Photo précédente" onClick={() => { setFailed(false); setIndex((index - 1 + orderedPhotos.length) % orderedPhotos.length) }}>‹</button><span>{index + 1} / {orderedPhotos.length}</span><button type="button" aria-label="Photo suivante" title="Photo suivante" onClick={() => { setFailed(false); setIndex((index + 1) % orderedPhotos.length) }}>›</button></figcaption>}
  </figure>
}
