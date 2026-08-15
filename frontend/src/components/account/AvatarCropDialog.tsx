import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crop, Minus, Move, Plus, RotateCcw, X } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'

type PreparedImage = {
  url: string
  width: number
  height: number
}

type Point = { x: number; y: number }

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15
const OUTPUT_SIZE = 512

export function AvatarCropDialog({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (file: File) => Promise<boolean> }) {
  const { t } = useI18n()
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [frameSize, setFrameSize] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null)

  useEffect(() => {
    let active = true
    let prepared: PreparedImage | null = null
    void prepareImage(file)
      .then((result) => {
        prepared = result
        if (active) setImage(result)
        else URL.revokeObjectURL(result.url)
      })
      .catch(() => { if (active) setError(t('account.avatarCrop.loadError')) })
    return () => {
      active = false
      if (prepared) URL.revokeObjectURL(prepared.url)
    }
  }, [file, t])

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processing) { event.preventDefault(); event.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel, processing])

  useEffect(() => {
    if (!frameRef.current) return
    const update = () => setFrameSize(frameRef.current?.clientWidth ?? 0)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [image])

  const coverScale = image && frameSize ? Math.max(frameSize / image.width, frameSize / image.height) : 1
  const displayWidth = image ? image.width * coverScale * zoom : 0
  const displayHeight = image ? image.height * coverScale * zoom : 0
  const clamp = (point: Point, nextZoom = zoom): Point => {
    if (!image || !frameSize) return { x: 0, y: 0 }
    const scale = coverScale * nextZoom
    return {
      x: Math.max(-(image.width * scale - frameSize) / 2, Math.min((image.width * scale - frameSize) / 2, point.x)),
      y: Math.max(-(image.height * scale - frameSize) / 2, Math.min((image.height * scale - frameSize) / 2, point.y)),
    }
  }
  const changeZoom = (value: number) => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
    setZoom(next)
    setOffset((current) => clamp(current, next))
  }
  const reset = () => { setZoom(MIN_ZOOM); setOffset({ x: 0, y: 0 }) }
  const apply = async () => {
    if (!image || !imageRef.current || !frameSize) return
    setProcessing(true); setError(null)
    try {
      const cropped = await cropAvatar(imageRef.current, image, frameSize, coverScale * zoom, offset)
      if (await onConfirm(cropped)) onCancel()
    } catch {
      setError(t('account.avatarCrop.error'))
    } finally {
      setProcessing(false)
    }
  }

  return createPortal(
    <div className="account-avatar-crop-overlay" role="presentation">
      <section className="account-avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <header>
          <span className="account-avatar-crop-dialog__icon"><Crop aria-hidden="true" /></span>
          <div><span>{t('account.avatarCrop.eyebrow')}</span><h2 id="avatar-crop-title">{t('account.avatarCrop.title')}</h2><p>{t('account.avatarCrop.description')}</p></div>
          <button ref={closeRef} className="panel-icon-button modal-header-close" type="button" aria-label={t('account.avatarCrop.cancel')} disabled={processing} onClick={onCancel}><X aria-hidden="true" /></button>
        </header>
        <div className="account-avatar-crop-dialog__body">
          {error && <div className="form-alert" role="alert">{error}</div>}
          <div
            ref={frameRef}
            className={`account-avatar-crop-frame${dragRef.current ? ' is-dragging' : ''}`}
            aria-label={t('account.avatarCrop.preview')}
            onPointerDown={(event) => {
              if (!image) return
              event.currentTarget.setPointerCapture(event.pointerId)
              dragRef.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: offset }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag || drag.pointerId !== event.pointerId) return
              setOffset(clamp({ x: drag.origin.x + event.clientX - drag.start.x, y: drag.origin.y + event.clientY - drag.start.y }))
            }}
            onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null }}
            onPointerCancel={() => { dragRef.current = null }}
            onWheel={(event) => { event.preventDefault(); changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)) }}
          >
            {image
              ? <img ref={imageRef} src={image.url} alt="" draggable="false" style={{ width: displayWidth, height: displayHeight, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }} />
              : <span className="account-avatar-crop-frame__loading">{t('account.avatarCrop.loading')}</span>}
            <span className="account-avatar-crop-frame__mask" aria-hidden="true" />
          </div>
          <p className="account-avatar-crop-dialog__hint"><Move aria-hidden="true" />{t('account.avatarCrop.moveHint')}</p>
          <div className="account-avatar-crop-controls">
            <button type="button" aria-label={t('account.avatarCrop.zoomOut')} disabled={!image || zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - ZOOM_STEP)}><Minus aria-hidden="true" /></button>
            <label><span>{t('account.avatarCrop.zoom')}</span><input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.01" value={zoom} disabled={!image} onChange={(event) => changeZoom(Number(event.target.value))} /></label>
            <button type="button" aria-label={t('account.avatarCrop.zoomIn')} disabled={!image || zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + ZOOM_STEP)}><Plus aria-hidden="true" /></button>
            <button className="account-avatar-crop-controls__reset" type="button" disabled={!image || (zoom === MIN_ZOOM && offset.x === 0 && offset.y === 0)} onClick={reset}><RotateCcw aria-hidden="true" />{t('account.avatarCrop.reset')}</button>
          </div>
        </div>
        <footer>
          <button className="account-button account-button--secondary" type="button" disabled={processing} onClick={onCancel}>{t('account.avatarCrop.cancel')}</button>
          <button className="account-button account-button--primary" type="button" disabled={!image || processing} onClick={() => void apply()}>{processing ? t('account.avatarCrop.processing') : t('account.avatarCrop.apply')}</button>
        </footer>
      </section>
    </div>, document.body,
  )
}

async function prepareImage(file: File): Promise<PreparedImage> {
  if ('createImageBitmap' in window) {
    // `from-image` asks the browser decoder to apply the EXIF transform before
    // exposing pixels to the cropper. The exported canvas then contains upright
    // pixels and no longer depends on metadata at display time.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try { return canvasForOrientation(bitmap, bitmap.width, bitmap.height, 1) }
    finally { bitmap.close() }
  }
  const sourceUrl = URL.createObjectURL(file)
  try {
    const source = await loadImage(sourceUrl)
    // Browsers without createImageBitmap generally apply EXIF orientation to
    // HTML images themselves, so the displayed dimensions are already final.
    return canvasForOrientation(source, source.naturalWidth, source.naturalHeight, 1)
  } finally { URL.revokeObjectURL(sourceUrl) }
}

function canvasForOrientation(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, orientation: number): PreparedImage {
  const rotated = orientation >= 5 && orientation <= 8
  const canvas = document.createElement('canvas')
  canvas.width = rotated ? sourceHeight : sourceWidth
  canvas.height = rotated ? sourceWidth : sourceHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    1: [1, 0, 0, 1, 0, 0], 2: [-1, 0, 0, 1, sourceWidth, 0], 3: [-1, 0, 0, -1, sourceWidth, sourceHeight], 4: [1, 0, 0, -1, 0, sourceHeight],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, sourceHeight, 0], 7: [0, -1, -1, 0, sourceHeight, sourceWidth], 8: [0, -1, 1, 0, 0, sourceWidth],
  }
  context.setTransform(...(transforms[orientation] ?? transforms[1]))
  context.drawImage(source, 0, 0)
  return { url: canvas.toDataURL('image/jpeg', 0.94), width: canvas.width, height: canvas.height }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

async function cropAvatar(element: HTMLImageElement, image: PreparedImage, frameSize: number, scale: number, offset: Point): Promise<File> {
  const sourceSize = frameSize / scale
  const sourceX = Math.max(0, Math.min(image.width - sourceSize, (image.width - sourceSize) / 2 - offset.x / scale))
  const sourceY = Math.max(0, Math.min(image.height - sourceSize, (image.height - sourceSize) / 2 - offset.y / scale))
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(element, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to export avatar')), 'image/webp', 0.9))
  return new File([blob], 'avatar.webp', { type: blob.type || 'image/webp', lastModified: Date.now() })
}
