import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, MapPin, Maximize2, Save, Trash2, X } from 'lucide-react'

import { deleteTripNightPhoto, tripNightPhotoUrl, updateTripNight, uploadTripNightPhoto } from '../../api/trips'
import type { TripNight, TripNightPhoto } from '../../types/trip'

interface Props {
  night: TripNight
  canEdit: boolean
  onUpdated: (night: TripNight) => void
  onClose: () => void
}

const nightPhotos = (night: TripNight): TripNightPhoto[] => night.photos?.length
  ? night.photos
  : night.photo_id ? [{ id: night.photo_id, sort_order: 0 }] : []

export function TripNightMapPopup({ night, canEdit, onUpdated, onClose }: Props) {
  const photos = nightPhotos(night)
  const [description, setDescription] = useState(night.description ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(photos[0]?.id ?? null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pasteInFlight = useRef(false)
  const activeIndex = Math.max(0, photos.findIndex((photo) => photo.id === activePhotoId))
  const activePhoto = photos[activeIndex] ?? null

  useEffect(() => setDescription(night.description ?? ''), [night.description, night.id])

  useEffect(() => {
    pasteInFlight.current = false
    setPasteNotice(null)
    setLightboxOpen(false)
  }, [night.id])

  useEffect(() => {
    if (activePhotoId && photos.some((photo) => photo.id === activePhotoId)) return
    setActivePhotoId(photos[0]?.id ?? null)
  }, [activePhotoId, photos])

  const selectUploadedPhoto = (updated: TripNight) => {
    const updatedPhotos = nightPhotos(updated)
    setActivePhotoId(updatedPhotos.at(-1)?.id ?? null)
    onUpdated(updated)
  }

  const uploadPhoto = async (file: File, pasted = false) => {
    if (pasteInFlight.current) return
    pasteInFlight.current = true
    setPending(true)
    setError(null)
    if (pasted) setPasteNotice('Ajout de la capture…')
    try {
      selectUploadedPhoto(await uploadTripNightPhoto(night.id, file))
      if (pasted) setPasteNotice('Capture ajoutée à cette nuit.')
    } catch (caught) {
      if (pasted) setPasteNotice(null)
      setError(caught instanceof Error ? caught.message : 'Impossible d’ajouter cette image.')
    } finally {
      pasteInFlight.current = false
      setPending(false)
    }
  }

  useEffect(() => {
    if (!canEdit) return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith('image/'))
        ?? Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
      if (!file || pasteInFlight.current) return
      event.preventDefault()
      event.stopPropagation()
      void uploadPhoto(file, true)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  })

  useEffect(() => {
    if (!lightboxOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false)
      if (event.key === 'ArrowLeft') setActivePhotoId(photos[(activeIndex - 1 + photos.length) % photos.length]?.id ?? null)
      if (event.key === 'ArrowRight') setActivePhotoId(photos[(activeIndex + 1) % photos.length]?.id ?? null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, lightboxOpen, photos])

  const run = async (action: () => Promise<TripNight>) => {
    setPending(true)
    setError(null)
    try { onUpdated(await action()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de mettre à jour cette nuit.') }
    finally { setPending(false) }
  }

  const removePhoto = async (photoId: string) => {
    setPending(true)
    setError(null)
    try {
      const updated = await deleteTripNightPhoto(night.id, photoId)
      const remaining = nightPhotos(updated)
      setActivePhotoId(remaining[Math.min(activeIndex, remaining.length - 1)]?.id ?? null)
      if (!remaining.length) setLightboxOpen(false)
      onUpdated(updated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de supprimer cette image.')
    } finally {
      setPending(false)
    }
  }

  const showPrevious = () => setActivePhotoId(photos[(activeIndex - 1 + photos.length) % photos.length]?.id ?? null)
  const showNext = () => setActivePhotoId(photos[(activeIndex + 1) % photos.length]?.id ?? null)

  return <><article className="place-map-popup trip-stop-map-popup trip-night-map-popup" aria-labelledby={`trip-night-popup-title-${night.id}`}>
    <header>
      <div><span>Nuit</span><h2 id={`trip-night-popup-title-${night.id}`}>{night.name}</h2></div>
      <button type="button" aria-label="Fermer la fiche de la nuit" title="Fermer" onClick={onClose}><X aria-hidden="true" size={15} /></button>
    </header>
    {activePhoto ? <div className="trip-night-gallery">
      <button className="trip-night-gallery__image" type="button" title="Afficher la photo en grand" aria-label={`Afficher la photo ${activeIndex + 1} sur ${photos.length} en grand`} onClick={() => setLightboxOpen(true)}>
        <img className="trip-night-map-popup__photo" src={tripNightPhotoUrl(night.id, activePhoto.id)} alt={`Photo ${activeIndex + 1} de ${night.name}`} />
        <Maximize2 aria-hidden="true" size={17} />
      </button>
      {canEdit && <button className="trip-night-gallery__delete" type="button" disabled={pending} title="Supprimer cette photo" aria-label={`Supprimer la photo ${activeIndex + 1}`} onClick={() => void removePhoto(activePhoto.id)}><Trash2 aria-hidden="true" size={16} /></button>}
      {photos.length > 1 && <>
        <button className="trip-night-gallery__previous" type="button" aria-label="Photo précédente" title="Photo précédente" onClick={showPrevious}><ChevronLeft aria-hidden="true" size={19} /></button>
        <button className="trip-night-gallery__next" type="button" aria-label="Photo suivante" title="Photo suivante" onClick={showNext}><ChevronRight aria-hidden="true" size={19} /></button>
        <span className="trip-night-gallery__counter">{activeIndex + 1} / {photos.length}</span>
      </>}
    </div> : <div className="trip-night-map-popup__photo trip-night-map-popup__photo--empty"><ImagePlus aria-hidden="true" /><span>Aucune photo</span></div>}
    {canEdit && (pasteNotice
      ? <p className={`popup-paste-notice${pending ? ' is-loading' : ''}`} role="status" aria-live="polite">{pasteNotice}</p>
      : <p className="popup-paste-hint">Cliquez sur la fiche puis collez une capture avec <kbd>Ctrl</kbd> + <kbd>V</kbd></p>)}
    {night.address && <p className="trip-night-map-popup__address"><MapPin aria-hidden="true" size={15} /><span>{night.address}</span></p>}
    <section className="trip-night-map-popup__description">
      <label htmlFor={`trip-night-description-${night.id}`}>Description</label>
      {canEdit ? <textarea id={`trip-night-description-${night.id}`} value={description} placeholder="Ajoutez une description de l’hébergement…" maxLength={10000} onChange={(event) => setDescription(event.target.value)} /> : <p>{description || 'Aucune description.'}</p>}
    </section>
    {error && <p className="trip-night-map-popup__error" role="alert">{error}</p>}
    <footer className="popup-actions">
      {canEdit && <>
        <input ref={fileInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void files.reduce((chain, file) => chain.then(() => uploadPhoto(file)), Promise.resolve()) }} />
        <button type="button" disabled={pending} onClick={() => fileInput.current?.click()}><ImagePlus aria-hidden="true" size={15} /><span>Ajouter des photos</span></button>
        <button type="button" disabled={pending || description === (night.description ?? '')} onClick={() => void run(() => updateTripNight(night.id, { description: description.trim() || null }))}><Save aria-hidden="true" size={15} /><span>Enregistrer</span></button>
      </>}
      {night.google_place_id && <a href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(night.google_place_id)}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={15} /><span>Google Maps</span></a>}
    </footer>
  </article>
    {lightboxOpen && activePhoto && createPortal(<div className="trip-night-lightbox" role="dialog" aria-modal="true" aria-label={`Photo ${activeIndex + 1} de ${night.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false) }}>
      <button className="trip-night-lightbox__close" type="button" aria-label="Fermer la photo" title="Fermer" onClick={() => setLightboxOpen(false)}><X aria-hidden="true" size={20} /></button>
      {photos.length > 1 && <button className="trip-night-lightbox__previous" type="button" aria-label="Photo précédente" onClick={showPrevious}><ChevronLeft aria-hidden="true" size={28} /></button>}
      <img src={tripNightPhotoUrl(night.id, activePhoto.id)} alt={`Photo ${activeIndex + 1} de ${night.name}`} />
      {photos.length > 1 && <button className="trip-night-lightbox__next" type="button" aria-label="Photo suivante" onClick={showNext}><ChevronRight aria-hidden="true" size={28} /></button>}
      <span>{activeIndex + 1} / {photos.length}</span>
    </div>, document.body)}
  </>
}
