import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, RotateCcw, Star, X } from 'lucide-react'

import { getPhotoFileUrl } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { photoViewerMessages } from './photoViewerI18n'

interface Props {
  photos: Photo[]
  placeName: string
  initialPhotoId?: string | null
  onClose: () => void
}

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function PhotoViewer({ photos, placeName, initialPhotoId = null, onClose }: Props) {
  const t = photoViewerMessages()
  const orderedPhotos = useMemo(
    () => [...photos].sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    [photos],
  )
  const initialIndex = Math.max(0, orderedPhotos.findIndex((photo) => photo.id === initialPhotoId))
  const [index, setIndex] = useState(initialIndex)
  const [loading, setLoading] = useState(true)
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(new Set())
  const [retryKey, setRetryKey] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const photo = orderedPhotos[index]

  useEffect(() => {
    setIndex(initialIndex)
  }, [initialIndex])

  useEffect(() => {
    setLoading(true)
  }, [index, retryKey])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    const candidates = [orderedPhotos[index - 1], orderedPhotos[index + 1]].filter((item): item is Photo => item !== undefined)
    const preloads = candidates.map((item) => {
      const image = new Image()
      image.src = getPhotoFileUrl(item.id)
      return image
    })
    return () => preloads.forEach((image) => { image.src = '' })
  }, [index, orderedPhotos])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1))
      else if (event.key === 'ArrowRight') setIndex((current) => Math.min(orderedPhotos.length - 1, current + 1))
      else if (event.key === 'Home') setIndex(0)
      else if (event.key === 'End') setIndex(orderedPhotos.length - 1)
      else if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, orderedPhotos.length])

  if (!photo) return null

  const failed = failedPhotoIds.has(photo.id)
  const alt = photo.description || photo.original_name || `${placeName} — ${t.position(index + 1, orderedPhotos.length)}`
  const select = (nextIndex: number) => setIndex(Math.max(0, Math.min(orderedPhotos.length - 1, nextIndex)))
  const finishSwipe = (x: number, y: number) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const horizontal = x - start.x
    const vertical = y - start.y
    if (Math.abs(horizontal) < 48 || Math.abs(horizontal) <= Math.abs(vertical)) return
    select(index + (horizontal < 0 ? 1 : -1))
  }

  return createPortal(
    <div
      className="photo-viewer-overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0]
        if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0]
        if (touch) finishSwipe(touch.clientX, touch.clientY)
      }}
    >
      <section ref={dialogRef} className="photo-viewer" role="dialog" aria-modal="true" aria-labelledby="photo-viewer-title">
        <header className="photo-viewer__header">
          <div>
            <p id="photo-viewer-title">{placeName}</p>
            <span aria-live="polite">{t.position(index + 1, orderedPhotos.length)}</span>
          </div>
          <button ref={closeRef} type="button" aria-label={t.close} title={t.close} onClick={onClose}><X size={21} /></button>
        </header>
        <div className="photo-viewer__stage">
          {loading && !failed && <div className="photo-viewer__loading" role="status"><span />{t.loading}</div>}
          {failed
            ? <div className="photo-viewer__error" role="alert"><strong>{t.error}</strong><button type="button" onClick={() => { setFailedPhotoIds((current) => { const next = new Set(current); next.delete(photo.id); return next }); setRetryKey((value) => value + 1) }}><RotateCcw size={16} />{t.retry}</button></div>
            : <img key={`${photo.id}:${retryKey}`} src={getPhotoFileUrl(photo.id)} alt={alt} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailedPhotoIds((current) => new Set(current).add(photo.id)) }} />}
          {orderedPhotos.length > 1 && <>
            <button className="photo-viewer__previous" type="button" disabled={index === 0} aria-label={t.previous} title={t.previous} onClick={() => select(index - 1)}><ChevronLeft size={25} /></button>
            <button className="photo-viewer__next" type="button" disabled={index === orderedPhotos.length - 1} aria-label={t.next} title={t.next} onClick={() => select(index + 1)}><ChevronRight size={25} /></button>
          </>}
        </div>
        <footer className="photo-viewer__footer">
          <div className="photo-viewer__caption">
            {photo.is_primary && <span><Star size={13} fill="currentColor" />{t.main}</span>}
            {photo.description && <p>{photo.description}</p>}
            {photo.taken_at && <time dateTime={photo.taken_at}>{new Intl.DateTimeFormat(navigator.language, { dateStyle: 'long' }).format(new Date(`${photo.taken_at}T00:00:00`))}</time>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
