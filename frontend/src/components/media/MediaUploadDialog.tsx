import { useRef, useState } from 'react'
import { X } from 'lucide-react'

interface MediaUploadDialogProps {
  onClose: () => void
  onDone: () => void
}

/**
 * Import files without assigning them to a country or map. The attachment is
 * deliberately deferred until the user creates or selects a POI.
 */
export function MediaUploadDialog({ onClose, onDone }: MediaUploadDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const { uploadPreparedMedia } = await import('../../media/uploadProcessing')
      await uploadPreparedMedia(Array.from(files))
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
          <p>Les images sont compressées automatiquement selon les réglages de l’instance. Les coordonnées GPS sont conservées pour créer un POI ultérieurement.</p>
          {error && <p className="form-alert" role="alert">{error}</p>}
        </div>
        <footer className="media-upload-modal__actions">
          <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void submit(event.target.files)} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => void submit(event.target.files)} />
          <button className="account-button account-button--secondary" disabled={busy} type="button" onClick={() => fileRef.current?.click()}>Choisir des photos</button>
          <button className="account-button account-button--primary" disabled={busy} type="button" onClick={() => cameraRef.current?.click()}>Prendre une photo</button>
        </footer>
      </section>
    </div>
  )
}
