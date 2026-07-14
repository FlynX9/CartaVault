import { useEffect, useState } from 'react'
import { deletePhoto, getPhotoFileUrl, getPlacePhotos, reorderPlacePhotos, updatePhoto, uploadPlacePhoto } from '../../api/photos'
import type { Photo } from '../../types/photo'
import { PhotoUploader } from './PhotoUploader'

interface Props { placeId: string; onChanged?: () => void }

export function PhotoGalleryManager({ placeId, onChanged }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]); const [files, setFiles] = useState<File[]>([]); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const reload = async () => { const next = await getPlacePhotos(placeId, new AbortController().signal); setPhotos(next) }
  useEffect(() => { void getPlacePhotos(placeId, new AbortController().signal).then(setPhotos).catch((caught) => setError(caught instanceof Error ? caught.message : 'Photos indisponibles.')) }, [placeId])
  const refresh = async () => { await reload(); onChanged?.() }
  const upload = async () => { setBusy(true); setError(null); const failed: File[] = []; for (const file of files) { try { await uploadPlacePhoto(placeId, file) } catch { failed.push(file) } } setFiles(failed); try { await refresh(); if (failed.length) setError(`${failed.length} photo(s) n’ont pas été envoyée(s).`) } finally { setBusy(false) } }
  const move = async (index: number, delta: number) => { const next = [...photos]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPhotos(next); try { setBusy(true); setPhotos(await reorderPlacePhotos(placeId, next.map((photo) => photo.id))); onChanged?.() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Réorganisation impossible.'); await reload() } finally { setBusy(false) } }
  const remove = async (photo: Photo) => { if (!window.confirm(`Supprimer « ${photo.original_name ?? photo.filename} » ?`)) return; setBusy(true); try { await deletePhoto(photo.id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') } finally { setBusy(false) } }
  return <section className="photo-manager"><PhotoUploader files={files} onChange={setFiles} disabled={busy} />{files.length > 0 && <button className="primary-button" type="button" disabled={busy} onClick={() => void upload()}>Envoyer les photos</button>}{error && <p className="form-alert" role="alert">{error}</p>}<div className="photo-manager-grid">{photos.map((photo, index) => <article className="photo-manager-card" key={photo.id}><img loading="lazy" src={getPhotoFileUrl(photo.id)} alt={photo.description || photo.original_name || 'Photo du POI'} /><p>{photo.is_primary ? 'Photo principale' : `Rang ${index + 1}`}</p><div><button type="button" disabled={busy || photo.is_primary} onClick={() => void updatePhoto(photo.id, { is_primary: true }).then(refresh)}>Principale</button><button type="button" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label="Déplacer vers la gauche">←</button><button type="button" disabled={busy || index === photos.length - 1} onClick={() => void move(index, 1)} aria-label="Déplacer vers la droite">→</button><button type="button" disabled={busy} onClick={() => void remove(photo)}>Supprimer</button></div></article>)}</div></section>
}
