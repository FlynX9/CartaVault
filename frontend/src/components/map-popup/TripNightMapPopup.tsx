import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImagePlus, Link2, MapPin, Maximize2, Pencil, Save, Trash2, X } from 'lucide-react'

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
const clockValue = (value?: string | null) => value?.slice(0, 5) ?? ''
const normalizedWebsite = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function TripNightMapPopup({ night, canEdit, onUpdated, onClose }: Props) {
  const photos = nightPhotos(night)
  const [description, setDescription] = useState(night.description ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(night.website_url ?? '')
  const [websiteEditing, setWebsiteEditing] = useState(false)
  const [checkInFromTime, setCheckInFromTime] = useState(clockValue(night.check_in_from_time))
  const [checkInUntilTime, setCheckInUntilTime] = useState(clockValue(night.check_in_until_time ?? night.check_in_time))
  const [checkOutFromTime, setCheckOutFromTime] = useState(clockValue(night.check_out_from_time))
  const [checkOutUntilTime, setCheckOutUntilTime] = useState(clockValue(night.check_out_until_time ?? night.check_out_time))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [activePhotoId, setActivePhotoId] = useState<string | null>(photos[0]?.id ?? null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pasteInFlight = useRef(false)
  const activeIndex = Math.max(0, photos.findIndex((photo) => photo.id === activePhotoId))
  const activePhoto = photos[activeIndex] ?? null

  useEffect(() => {
    setDescription(night.description ?? '')
    setWebsiteUrl(night.website_url ?? '')
    setWebsiteEditing(false)
    setCheckInFromTime(clockValue(night.check_in_from_time))
    setCheckInUntilTime(clockValue(night.check_in_until_time ?? night.check_in_time))
    setCheckOutFromTime(clockValue(night.check_out_from_time))
    setCheckOutUntilTime(clockValue(night.check_out_until_time ?? night.check_out_time))
  }, [night])

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
  const detailsChanged = description !== (night.description ?? '')
    || normalizedWebsite(websiteUrl) !== (night.website_url ?? null)
    || checkInFromTime !== clockValue(night.check_in_from_time)
    || checkInUntilTime !== clockValue(night.check_in_until_time ?? night.check_in_time)
    || checkOutFromTime !== clockValue(night.check_out_from_time)
    || checkOutUntilTime !== clockValue(night.check_out_until_time ?? night.check_out_time)

  return <><article className="place-map-popup trip-night-map-popup" aria-labelledby={`trip-night-popup-title-${night.id}`}>
    <section className="popup-hero">
      {activePhoto ? <figure className="popup-gallery trip-night-gallery">
        <button className="trip-night-gallery__image" type="button" title="Afficher la photo en grand" aria-label={`Afficher la photo ${activeIndex + 1} sur ${photos.length} en grand`} onClick={() => setLightboxOpen(true)}>
          <img className="trip-night-map-popup__photo" src={tripNightPhotoUrl(night.id, activePhoto.id)} alt={`Photo ${activeIndex + 1} de ${night.name}`} />
          <Maximize2 className="trip-night-hover-action" aria-hidden="true" size={17} />
        </button>
        {canEdit && <button className="trip-night-gallery__delete trip-night-hover-action" type="button" disabled={pending} title="Supprimer cette photo" aria-label={`Supprimer la photo ${activeIndex + 1}`} onClick={() => void removePhoto(activePhoto.id)}><Trash2 aria-hidden="true" size={16} /></button>}
        {photos.length > 1 && <>
          <button className="trip-night-gallery__previous trip-night-hover-action" type="button" aria-label="Photo précédente" title="Photo précédente" onClick={showPrevious}><ChevronLeft aria-hidden="true" size={19} /></button>
          <button className="trip-night-gallery__next trip-night-hover-action" type="button" aria-label="Photo suivante" title="Photo suivante" onClick={showNext}><ChevronRight aria-hidden="true" size={19} /></button>
          <span className="trip-night-gallery__counter">{activeIndex + 1} / {photos.length}</span>
        </>}
      </figure> : <figure className="popup-gallery trip-night-gallery trip-night-map-popup__photo--empty"><ImagePlus aria-hidden="true" /><span>Aucune photo</span></figure>}
      <div className="popup-overview">
        <div className="popup-heading">
          <h2 id={`trip-night-popup-title-${night.id}`} title={night.name}>{night.name}</h2>
          <div className="popup-heading-actions">
            <button className="popup-close" type="button" aria-label="Fermer la fiche de la nuit" title="Fermer" onClick={onClose}><X aria-hidden="true" size={15} /></button>
          </div>
        </div>
        <div className="popup-overview-metadata trip-night-overview-metadata">
          <section role="group" aria-label="Arrivée">
            <span>Arrivée</span>
            <div className="trip-night-time-range">
              <label><span>À partir de</span>{canEdit ? <input type="time" value={checkInFromTime} onChange={(event) => setCheckInFromTime(event.target.value)} /> : <strong>{checkInFromTime || '—'}</strong>}</label>
              <label><span>Jusqu’à</span>{canEdit ? <input type="time" value={checkInUntilTime} onChange={(event) => setCheckInUntilTime(event.target.value)} /> : <strong>{checkInUntilTime || '—'}</strong>}</label>
            </div>
          </section>
          <section role="group" aria-label="Départ">
            <span>Départ</span>
            <div className="trip-night-time-range">
              <label><span>À partir de</span>{canEdit ? <input type="time" value={checkOutFromTime} onChange={(event) => setCheckOutFromTime(event.target.value)} /> : <strong>{checkOutFromTime || '—'}</strong>}</label>
              <label><span>Jusqu’à</span>{canEdit ? <input type="time" value={checkOutUntilTime} onChange={(event) => setCheckOutUntilTime(event.target.value)} /> : <strong>{checkOutUntilTime || '—'}</strong>}</label>
            </div>
          </section>
        </div>
      </div>
    </section>
    {canEdit && (pasteNotice
      ? <p className={`popup-paste-notice${pending ? ' is-loading' : ''}`} role="status" aria-live="polite">{pasteNotice}</p>
      : <p className="popup-paste-hint">Cliquez sur la fiche puis collez une capture avec <kbd>Ctrl</kbd> + <kbd>V</kbd></p>)}
    <section className="popup-description trip-night-map-popup__description">
      <h3><FileText aria-hidden="true" size={17} />Description</h3>
      {canEdit ? <textarea id={`trip-night-description-${night.id}`} aria-label="Description" value={description} placeholder="Ajoutez une description de l’hébergement…" maxLength={10000} onChange={(event) => setDescription(event.target.value)} /> : <p>{description || 'Aucune description.'}</p>}
    </section>
    <div className="popup-summary trip-night-summary">
      <article aria-label="Adresse de l’hébergement"><MapPin aria-hidden="true" /><p><b>Adresse</b><span>{night.address || 'Non renseignée'}</span></p></article>
      <article aria-label="Site web de l’hébergement"><Link2 aria-hidden="true" /><p><b>Site web</b><span className="trip-night-website-field">
        {canEdit && websiteEditing
          ? <input autoFocus type="url" value={websiteUrl} placeholder="https://www.exemple.com" aria-label="Adresse du site web" onChange={(event) => setWebsiteUrl(event.target.value)} />
          : websiteUrl ? <a href={normalizedWebsite(websiteUrl) ?? undefined} target="_blank" rel="noreferrer">{websiteUrl.replace(/^https?:\/\//i, '')}<ExternalLink aria-hidden="true" size={13} /></a> : <em>Aucune adresse web</em>}
        {canEdit && <button type="button" aria-label={websiteEditing ? 'Terminer la modification du site web' : 'Modifier le site web'} title={websiteEditing ? 'Terminer' : 'Modifier'} onClick={() => setWebsiteEditing((current) => !current)}>{websiteEditing ? <Save aria-hidden="true" size={14} /> : <Pencil aria-hidden="true" size={14} />}</button>}
      </span></p></article>
    </div>
    {error && <p className="trip-night-map-popup__error" role="alert">{error}</p>}
    <footer className="popup-actions">
      {canEdit && <>
        <input ref={fileInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void files.reduce((chain, file) => chain.then(() => uploadPhoto(file)), Promise.resolve()) }} />
        <button type="button" disabled={pending} onClick={() => fileInput.current?.click()}><ImagePlus aria-hidden="true" size={15} /><span>Ajouter des photos</span></button>
        <button type="button" disabled={pending || !detailsChanged} onClick={() => void run(async () => { const updated = await updateTripNight(night.id, { description: description.trim() || null, website_url: normalizedWebsite(websiteUrl), check_in_from_time: checkInFromTime || null, check_in_until_time: checkInUntilTime || null, check_out_from_time: checkOutFromTime || null, check_out_until_time: checkOutUntilTime || null }); setWebsiteEditing(false); return updated })}><Save aria-hidden="true" size={15} /><span>Enregistrer</span></button>
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
