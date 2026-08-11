import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Plus, X } from 'lucide-react'

import { validatePhotoFile } from './photoUtils'
import { FieldHelp } from '../common/FieldHelp'

interface Props { files: File[]; onChange: (files: File[]) => void; disabled?: boolean; headerAction?: ReactNode }

export function PhotoUploader({ files, onChange, disabled = false, headerAction }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropActive, setDropActive] = useState(false)
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { pendingPhotos: files.length > 0 } }))
  }, [files.length])
  const addFiles = (incoming: FileList | File[]) => onChange([...files, ...Array.from(incoming).filter((file) => validatePhotoFile(file) === null)])
  return <section className={`form-section photo-uploader${dropActive ? ' is-drop-active' : ''}`} aria-labelledby="photo-upload-title" onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }} onDrop={(event) => { event.preventDefault(); setDropActive(false); addFiles(event.dataTransfer.files) }}>
    <div className="photo-uploader-heading"><div><h3 id="photo-upload-title">Photos<FieldHelp>JPEG, PNG ou WebP, 20 Mio maximum par fichier.</FieldHelp></h3></div><div className="photo-uploader-actions"><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} /><button className="photo-upload-button" type="button" disabled={disabled} aria-label="Ajouter des photos" title="Ajouter des photos" onClick={() => inputRef.current?.click()}><Camera aria-hidden="true" size={19} /><Plus aria-hidden="true" size={12} className="photo-upload-plus" /></button>{headerAction}</div></div>
    {files.length === 0 && <p className="photo-uploader__drop-hint">Glissez vos photos ici</p>}
    {files.length > 0 && <ul className="upload-queue" aria-live="polite">{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name} ({Math.ceil(file.size / 1024)} Ko)</span><button type="button" className="photo-upload-remove" disabled={disabled} aria-label={`Retirer ${file.name}`} title="Retirer" onClick={() => onChange(files.filter((_, currentIndex) => currentIndex !== index))}><X size={16} /></button></li>)}</ul>}
  </section>
}
