import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Move, SendHorizontal, Star, Trash2, Upload } from 'lucide-react'

import { deletePhoto, getPhotoFileUrl, getPhotoThumbnailUrl, getPlacePhotos, reorderPlacePhotos, updatePhoto, uploadPlacePhoto } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { PendingPhotoPreviews, PhotoUploader } from './PhotoUploader'
import { PhotoViewer } from './PhotoViewer'
import { photoViewerMessages } from './photoViewerI18n'
import { validatePhotoFile } from './photoUtils'

interface Props { placeId: string; placeName?: string; onChanged?: () => void }

function clamp(value: number) { return Math.max(0, Math.min(1, value)) }

function FramingDialog({ photo, onClose, onApply }: { photo: Photo; onClose: () => void; onApply: (x: number, y: number) => Promise<void> }) {
  const [focal, setFocal] = useState({ x: photo.focal_x ?? .5, y: photo.focal_y ?? .5 })
  const [saving, setSaving] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    setFocal({ x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) })
  }
  const apply = async () => { setSaving(true); try { await onApply(focal.x, focal.y); onClose() } finally { setSaving(false) } }
  return <div className="photo-framing-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="photo-framing-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-framing-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
      <header><div><h2 id="photo-framing-title">Ajuster le cadrage</h2><p>Faites glisser le repère vers la zone importante de l’image.</p></div></header>
      <div ref={stageRef} className="photo-framing-stage" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event) }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event) }}>
        <img src={getPhotoFileUrl(photo.id)} alt="Aperçu du cadrage" style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }} />
        <span className="photo-framing-focus" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} aria-hidden="true" />
      </div>
      <footer><button className="photo-framing-dialog__secondary" type="button" disabled={saving} onClick={() => setFocal({ x: .5, y: .5 })}>Réinitialiser</button><span /><button className="photo-framing-dialog__secondary" type="button" disabled={saving} onClick={onClose}>Annuler</button><button className="photo-framing-dialog__primary" type="button" disabled={saving} onClick={() => void apply()}>{saving ? 'Application…' : 'Appliquer'}</button></footer>
    </section>
  </div>
}

export function PhotoGalleryManager({ placeId, placeName = 'Photos du lieu', onChanged }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null)
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [framingPhoto, setFramingPhoto] = useState<Photo | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const t = photoViewerMessages()
  const orderedPhotos = useMemo(() => [...photos].sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.sort_order - right.sort_order), [photos])
  const selectedPhoto = orderedPhotos.find((photo) => photo.id === selectedPhotoId) ?? orderedPhotos[0] ?? null

  const reload = async () => { const next = await getPlacePhotos(placeId, new AbortController().signal); setPhotos(next); setSelectedPhotoId((current) => current && next.some((photo) => photo.id === current) ? current : next[0]?.id ?? null) }
  useEffect(() => { void reload().catch((caught) => setError(caught instanceof Error ? caught.message : 'Photos indisponibles.')) }, [placeId])
  useEffect(() => { document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { pendingPhotos: files.length > 0 } })) }, [files.length])
  useEffect(() => () => { document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { pendingPhotos: false } })) }, [])
  const refresh = async () => { await reload(); onChanged?.() }
  const upload = async () => { setBusy(true); setError(null); const failed: File[] = []; for (const file of files) try { await uploadPlacePhoto(placeId, file) } catch { failed.push(file) }; setFiles(failed); try { await refresh(); if (failed.length) setError(`${failed.length} photo(s) n’ont pas été envoyée(s).`) } finally { setBusy(false) } }
  const move = async (index: number, delta: number) => { const next = [...orderedPhotos]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPhotos(next); try { setBusy(true); setPhotos(await reorderPlacePhotos(placeId, next.map((photo) => photo.id))); onChanged?.() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Réorganisation impossible.'); await reload() } finally { setBusy(false) } }
  const remove = async (photo: Photo) => { const name = photo.original_name ?? photo.filename; if (!await confirm({ title: 'Supprimer cette photo ?', message: `« ${name} » sera définitivement supprimée. Cette action est irréversible.` })) return; setBusy(true); try { await deletePhoto(photo.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') } finally { setBusy(false) } }
  const setPrimary = async (photo: Photo) => { setBusy(true); try { await updatePhoto(photo.id, { is_primary: true }); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Mise à jour impossible.') } finally { setBusy(false) } }
  const addQueuedFiles = (incoming: FileList | File[]) => setFiles((current) => [...current, ...Array.from(incoming).filter((file) => validatePhotoFile(file) === null)])

  return <section className={`photo-manager${dropActive ? ' is-drop-active' : ''}`} aria-labelledby="photo-manager-title" onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }} onDrop={(event) => { event.preventDefault(); setDropActive(false); addQueuedFiles(event.dataTransfer.files) }}>
    <header className="photo-manager__header"><div><p className="form-section-eyebrow">Le lieu</p><h3 id="photo-manager-title">Photos</h3><p>Ajoutez des photos pour illustrer ce lieu.</p></div><div className="photo-manager__header-actions">{files.length > 0 && <button className="photo-manager__upload" type="button" disabled={busy} onClick={() => void upload()}><SendHorizontal aria-hidden="true" size={16} />Envoyer</button>}<label className="secondary-button place-links-editor__add photo-manager__add"><Upload size={15} />Ajouter des photos<input form="poi-edit-form" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { const selectedFiles = event.target.files; if (selectedFiles) addQueuedFiles(selectedFiles); event.target.value = '' }} /></label></div></header>
    {files.length > 0 && <PendingPhotoPreviews files={files} disabled={busy} onRemove={(index) => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} />}
    {error && <p className="form-alert" role="alert">{error}</p>}
    {selectedPhoto ? <div className="photo-gallery-layout"><article className="photo-gallery-main"><button type="button" className="photo-gallery-main__image" aria-label={`${t.view} — ${selectedPhoto.description || selectedPhoto.original_name || placeName}`} onClick={() => setViewerPhotoId(selectedPhoto.id)}><img src={getPhotoFileUrl(selectedPhoto.id)} alt={selectedPhoto.description || selectedPhoto.original_name || 'Photo du POI'} style={{ objectPosition: `${(selectedPhoto.focal_x ?? .5) * 100}% ${(selectedPhoto.focal_y ?? .5) * 100}%` }} />{selectedPhoto.is_primary && <span><Star size={13} fill="currentColor" />Photo principale</span>}<Maximize2 aria-hidden="true" /></button><div className="photo-gallery-main__actions"><button type="button" className={selectedPhoto.is_primary ? 'is-primary' : ''} disabled={busy || selectedPhoto.is_primary} onClick={() => void setPrimary(selectedPhoto)}><Star size={16} fill={selectedPhoto.is_primary ? 'currentColor' : 'none'} />{selectedPhoto.is_primary ? 'Photo principale' : 'Définir comme principale'}</button><button type="button" disabled={busy} onClick={() => setFramingPhoto(selectedPhoto)}><Move size={16} />Repositionner</button><button type="button" className="danger" disabled={busy} onClick={() => void remove(selectedPhoto)}><Trash2 size={16} />Supprimer</button></div></article><div className="photo-gallery-thumbnails" role="list" aria-label="Autres photos">{orderedPhotos.map((photo) => <button key={photo.id} type="button" role="listitem" className={photo.id === selectedPhoto.id ? 'is-selected' : ''} aria-pressed={photo.id === selectedPhoto.id} aria-label={`Afficher ${photo.description || photo.original_name || 'la photo'}`} onClick={() => setSelectedPhotoId(photo.id)}><img loading="lazy" src={getPhotoThumbnailUrl(photo.id)} alt="" style={{ objectPosition: `${(photo.focal_x ?? .5) * 100}% ${(photo.focal_y ?? .5) * 100}%` }} />{photo.is_primary && <Star aria-label="Photo principale" size={13} fill="currentColor" />}</button>)}</div><div className="photo-gallery-order"><button type="button" disabled={busy || orderedPhotos.findIndex((photo) => photo.id === selectedPhoto.id) === 0} onClick={() => void move(orderedPhotos.findIndex((photo) => photo.id === selectedPhoto.id), -1)} aria-label="Déplacer la photo plus tôt"><ChevronLeft size={16} />Déplacer plus tôt</button><button type="button" disabled={busy || orderedPhotos.findIndex((photo) => photo.id === selectedPhoto.id) === orderedPhotos.length - 1} onClick={() => void move(orderedPhotos.findIndex((photo) => photo.id === selectedPhoto.id), 1)} aria-label="Déplacer la photo plus tard">Déplacer plus tard<ChevronRight size={16} /></button></div></div> : <PhotoUploader files={files} onChange={setFiles} disabled={busy} compact />}
    {viewerPhotoId && <PhotoViewer photos={photos} placeName={placeName} initialPhotoId={viewerPhotoId} onClose={() => setViewerPhotoId(null)} />}
    {framingPhoto && <FramingDialog photo={framingPhoto} onClose={() => setFramingPhoto(null)} onApply={async (focal_x, focal_y) => { await updatePhoto(framingPhoto.id, { focal_x, focal_y }); await refresh() }} />}
    {dropActive && <div className="photo-manager__drop-overlay" aria-hidden="true">Déposer les images ici</div>}
    {confirmationDialog}
  </section>
}
