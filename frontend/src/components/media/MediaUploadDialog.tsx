import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, X } from 'lucide-react'

import type { PoiMap } from '../../types/map'

interface MediaUploadDialogProps {
  maps: PoiMap[]
  onClose: () => void
  onDone: () => void
}

/**
 * Deliberately plain, application-owned upload dialog.
 *
 * It has no portal, no API request and no EXIF import while it opens. This is
 * important on Android: selecting the toolbar action must always paint this
 * dialog before a file picker or a metadata parser can run.
 */
export function MediaUploadDialog({ maps, onClose, onDone }: MediaUploadDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [mapId, setMapId] = useState(() => maps.find((map) => map.can_edit)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editableMaps = maps.filter((map) => map.can_edit)

  useEffect(() => {
    setMapId((current) => editableMaps.some((map) => map.id === current) ? current : (editableMaps[0]?.id ?? ''))
  }, [editableMaps])

  const submit = async (files: FileList | null) => {
    if (!files?.length || !mapId) return
    setBusy(true)
    setError(null)
    try {
      // The processing module — including EXIF parsing — is loaded only once
      // a real image has been selected. It cannot affect dialog rendering.
      const { uploadPreparedMedia } = await import('../../media/uploadProcessing')
      await uploadPreparedMedia(Array.from(files), mapId)
      onDone()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
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
          <label>
            Carte
            <select value={mapId} onChange={(event) => setMapId(event.target.value)} disabled={busy || editableMaps.length === 0}>
              {editableMaps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.country.name}</option>)}
            </select>
          </label>
          {editableMaps.length === 0
            ? <p className="form-alert" role="alert">Aucune carte modifiable n’est disponible pour importer ces photos.</p>
            : <p>Les images sont compressées automatiquement selon les réglages de l’instance. Les coordonnées GPS sont conservées pour créer un POI ultérieurement.</p>}
          {error && <p className="form-alert" role="alert">{error}</p>}
        </div>
        <footer className="media-upload-modal__actions">
          <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void submit(event.target.files)} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => void submit(event.target.files)} />
          <button className="secondary-button" disabled={busy || !mapId} type="button" onClick={() => fileRef.current?.click()}><Upload size={16} />Choisir des photos</button>
          <button className="primary-button media-upload-camera" disabled={busy || !mapId} type="button" onClick={() => cameraRef.current?.click()}><Camera size={16} />Prendre une photo</button>
        </footer>
      </section>
    </div>
  )
}
