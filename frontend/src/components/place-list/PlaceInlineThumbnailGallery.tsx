import { useEffect, useState } from 'react'

import { getPlacePhotos } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PlacePopupGallery } from '../map-popup/PlacePopupGallery'

interface Props {
  placeId: string
  placeName: string
  statusColor: string
  categoryIcon?: string
}

/** Loads media only for the expanded POI and reuses the existing full-screen viewer. */
export function PlaceInlineThumbnailGallery({ placeId, placeName, statusColor, categoryIcon }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getPlacePhotos(placeId, controller.signal)
      .then(setPhotos)
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === 'AbortError')) setError('Photos indisponibles')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [placeId])

  return <div className="place-inline-thumbnail-gallery">
    <PlacePopupGallery placeName={placeName} photos={photos} isLoading={loading} error={error} statusColor={statusColor} categoryIcon={categoryIcon} />
  </div>
}
