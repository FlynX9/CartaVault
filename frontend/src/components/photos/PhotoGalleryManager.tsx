import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-react'

import { deletePhoto, getPhotoFileUrl, getPlacePhotos, reorderPlacePhotos, updatePhoto, uploadPlacePhoto } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PhotoUploader } from './PhotoUploader'
import { useConfirmDialog } from '../common/useConfirmDialog'

interface Props { placeId: string; onChanged?: () => void }

export function PhotoGalleryManager({ placeId, onChanged }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [photos, setPhotos] = useState<Photo[]>([]); const [files, setFiles] = useState<File[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const reload = async () => { const next = await getPlacePhotos(placeId, new AbortController().signal); setPhotos(next) }
  useEffect(() => { void getPlacePhotos(placeId, new AbortController().signal).then(setPhotos).catch((caught) => setError(caught instanceof Error ? caught.message : 'Photos indisponibles.')) }, [placeId])
  const refresh = async () => { await reload(); onChanged?.() }
  const upload = async () => { setBusy(true); setError(null); const failed: File[] = []; for (const file of files) { try { await uploadPlacePhoto(placeId, file) } catch { failed.push(file) } } setFiles(failed); try { await refresh(); if (failed.length) setError(`${failed.length} photo(s) n’ont pas été envoyée(s).`) } finally { setBusy(false) } }
  const move = async (index: number, delta: number) => { const next = [...photos]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPhotos(next); try { setBusy(true); setPhotos(await reorderPlacePhotos(placeId, next.map((photo) => photo.id))); onChanged?.() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Réorganisation impossible.'); await reload() } finally { setBusy(false) } }
  const remove = async (photo: Photo) => { const name = photo.original_name ?? photo.filename; if (!await confirm({ title: 'Supprimer cette photo ?', message: `« ${name} » sera définitivement supprimée. Cette action est irréversible.` })) return; setBusy(true); try { await deletePhoto(photo.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') } finally { setBusy(false) } }
  return <div className="photo-manager"><PhotoUploader files={files} onChange={setFiles} disabled={busy} />{files.length > 0 && <button className="primary-button" type="button" disabled={busy} onClick={() => void upload()}>Envoyer les photos</button>}{error && <p className="form-alert" role="alert">{error}</p>}<div className="photo-manager-grid">{photos.map((photo, index) => <article className="photo-manager-card" key={photo.id}><img loading="lazy" src={getPhotoFileUrl(photo.id)} alt={photo.description || photo.original_name || 'Photo du POI'} /><p>{photo.is_primary ? 'Photo principale' : `Rang ${index + 1}`}</p><div className="photo-card-actions"><button type="button" disabled={busy || photo.is_primary} onClick={() => void updatePhoto(photo.id, { is_primary: true }).then(refresh)} aria-label="Définir comme principale" title="Définir comme principale"><Star aria-hidden="true" size={16} /></button><button type="button" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label="Déplacer vers la gauche" title="Déplacer vers la gauche"><ChevronLeft aria-hidden="true" size={16} /></button><button type="button" disabled={busy || index === photos.length - 1} onClick={() => void move(index, 1)} aria-label="Déplacer vers la droite" title="Déplacer vers la droite"><ChevronRight aria-hidden="true" size={16} /></button><button type="button" className="photo-delete-button" disabled={busy} onClick={() => void remove(photo)} aria-label="Supprimer la photo" title="Supprimer"><Trash2 aria-hidden="true" size={16} /></button></div></article>)}</div>{confirmationDialog}</div>
}
