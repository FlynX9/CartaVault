import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Upload, X } from 'lucide-react'

import { getMediaUploadPolicy, uploadMedia } from '../../api/media'
import { getMaps } from '../../api/maps'
import { compressImage, readImageLocation } from '../../media/imageUpload'
import type { PoiMap } from '../../types/map'

interface MediaUploadDialogProps {
  onClose: () => void
  onDone: () => void
}

/** The importer uses an isolated portal rather than the media-viewer sheet. */
export function MediaUploadDialog({ onClose, onDone }: MediaUploadDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [maps, setMaps] = useState<PoiMap[]>([])
  const [mapId, setMapId] = useState('')
  const [maxUploadBytes, setMaxUploadBytes] = useState(5 * 1024 * 1024)
  const [maxImageDimension, setMaxImageDimension] = useState(2560)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getMaps(controller.signal), getMediaUploadPolicy(controller.signal)])
      .then(([items, policy]) => {
        if (controller.signal.aborted) return
        const editableMaps = items.filter((map) => map.can_edit)
        setMaps(editableMaps)
        setMapId((current) => current || editableMaps[0]?.id || '')
        setMaxUploadBytes(policy.max_upload_bytes)
        setMaxImageDimension(policy.max_image_dimension)
      })
      .catch((caught) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return
        setError(caught instanceof Error ? caught.message : 'Cartes indisponibles.')
      })
    return () => controller.abort()
  }, [])

  const submit = async (files: FileList | null) => {
    if (!files?.length || !mapId) return
    setBusy(true)
    setError(null)
    try {
      for (const source of Array.from(files)) {
        const [coordinates, compressed] = await Promise.all([
          readImageLocation(source),
          compressImage(source, maxImageDimension),
        ])
        if (compressed.size > maxUploadBytes) {
          throw new Error(`« ${source.name} » dépasse la limite d’import de ${(maxUploadBytes / 1024 / 1024).toLocaleString('fr-FR')} Mo.`)
        }
        await uploadMedia(compressed, mapId, coordinates, undefined, source)
      }
      onDone()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import impossible.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="media-upload-modal" role="presentation">
      <section className="media-upload-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="media-upload-title">
        <header className="media-upload-modal__header">
          <div>
            <p className="cv-workspace-panel__eyebrow">Médiathèque</p>
            <h2 id="media-upload-title">Importer des photos</h2>
          </div>
          <button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="media-upload-modal__content">
          <label>Carte<select value={mapId} onChange={(event) => setMapId(event.target.value)}>
            {maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.country.name}</option>)}
          </select></label>
          <p>Les images sont compressées automatiquement jusqu’à {maxImageDimension.toLocaleString('fr-FR')} px sur leur plus grand côté. Les coordonnées GPS sont conservées pour créer un POI ultérieurement.</p>
          {error && <p className="form-alert" role="alert">{error}</p>}
        </div>
        <footer className="media-upload-modal__actions">
          <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void submit(event.target.files)} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => void submit(event.target.files)} />
          <button className="secondary-button" disabled={busy || !mapId} type="button" onClick={() => fileRef.current?.click()}><Upload size={16} />Choisir des photos</button>
          <button className="primary-button media-upload-camera" disabled={busy || !mapId} type="button" onClick={() => cameraRef.current?.click()}><Camera size={16} />Prendre une photo</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
