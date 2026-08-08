import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PhotoViewer } from '../photos/PhotoViewer'
import { photoViewerMessages } from '../photos/photoViewerI18n'
import { offlineThumbnail } from '../../pwa/offlineData'

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
  const [offlineSource, setOfflineSource] = useState<string | null>(null)
  const orderedPhotos = useMemo(
    () => [...photos].sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    [photos],
  )
  const t = photoViewerMessages()
  const activePhotoId = orderedPhotos[index]?.id ?? null

  useLayoutEffect(() => {
    setIndex(0)
    setFailed(false)
    setViewerOpen(false)
  }, [photos])

  useEffect(() => {
    if (viewerOpen || orderedPhotos.length < 2) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isPasteTarget = target instanceof HTMLElement && target.dataset.popupPasteTarget === 'true'
      const isTextTarget = target instanceof HTMLElement && !isPasteTarget && (target.matches('input, textarea, select') || target.isContentEditable)
      if (isTextTarget || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      event.preventDefault()
      setFailed(false)
      setIndex((current) => event.key === 'ArrowLeft'
        ? (current - 1 + orderedPhotos.length) % orderedPhotos.length
        : (current + 1) % orderedPhotos.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [orderedPhotos.length, viewerOpen])

  useEffect(() => {
    let objectUrl: string | null = null
    setOfflineSource(null)
    if (activePhotoId === null || navigator.onLine) return
    void offlineThumbnail(activePhotoId).then((blob) => {
      if (!blob) return
      objectUrl = URL.createObjectURL(blob)
      setOfflineSource(objectUrl)
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [activePhotoId])

  if (isLoading) return <div className="popup-photo-placeholder" role="status">Chargement des photos…</div>
  if (error) return <div className="popup-photo-placeholder" role="alert">Photos indisponibles</div>
  if (orderedPhotos.length === 0) return <div className="popup-photo-placeholder">Aucune photo</div>

  const photo = orderedPhotos[index]
  const alternativeText = photo.description || `Photo de ${placeName}`

  const loadOfflineThumbnail = () => {
    void offlineThumbnail(photo.id).then((blob) => {
      if (!blob) { setFailed(true); return }
      setOfflineSource((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob) })
    })
  }

  return (
    <figure className="popup-gallery">
      {failed ? (
        <div className="popup-photo-placeholder" role="img" aria-label={alternativeText}>Image indisponible</div>
      ) : (
        <button className="popup-gallery__open" type="button" aria-label={`${t.view} — ${alternativeText}`} onClick={() => setViewerOpen(true)}>
          <img src={offlineSource ?? getPhotoFileUrl(photo.id)} alt={alternativeText} onError={() => offlineSource ? setFailed(true) : loadOfflineThumbnail()} />
          <span><Maximize2 aria-hidden="true" size={15} /></span>
        </button>
      )}
      {orderedPhotos.length > 1 && (
        <>
          <button className="trip-night-gallery__previous popup-gallery-hover-action" type="button" aria-label="Photo précédente" title="Photo précédente" onClick={() => { setFailed(false); setIndex((index - 1 + orderedPhotos.length) % orderedPhotos.length) }}><ChevronLeft size={19} aria-hidden="true" /></button>
          <button className="trip-night-gallery__next popup-gallery-hover-action" type="button" aria-label="Photo suivante" title="Photo suivante" onClick={() => { setFailed(false); setIndex((index + 1) % orderedPhotos.length) }}><ChevronRight size={19} aria-hidden="true" /></button>
          <span className="trip-night-gallery__counter" aria-label="Navigation des photos" aria-live="polite">{index + 1} / {orderedPhotos.length}</span>
        </>
      )}
      {viewerOpen && <PhotoViewer photos={orderedPhotos} placeName={placeName} initialPhotoId={photo.id} onClose={() => setViewerOpen(false)} />}
    </figure>
  )
}
