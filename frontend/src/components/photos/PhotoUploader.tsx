import { useRef } from 'react'
import { Camera, Plus } from 'lucide-react'

import { validatePhotoFile } from './photoUtils'

interface Props { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }

export function PhotoUploader({ files, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const addFiles = (incoming: FileList | File[]) => onChange([...files, ...Array.from(incoming).filter((file) => validatePhotoFile(file) === null)])
  return <section className="form-section photo-uploader" aria-labelledby="photo-upload-title" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}>
    <div className="photo-uploader-heading"><div><h3 id="photo-upload-title">Photos</h3><p className="form-hint">JPEG, PNG ou WebP, 20 Mio maximum par fichier.</p></div><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} /><button className="photo-upload-button" type="button" disabled={disabled} aria-label="Ajouter des photos" title="Ajouter des photos" onClick={() => inputRef.current?.click()}><Camera aria-hidden="true" size={19} /><Plus aria-hidden="true" size={12} className="photo-upload-plus" /></button></div>
    {files.length > 0 && <ul className="upload-queue" aria-live="polite">{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name} ({Math.ceil(file.size / 1024)} Ko)</span><button type="button" className="secondary-button" disabled={disabled} aria-label={`Retirer ${file.name}`} onClick={() => onChange(files.filter((_, currentIndex) => currentIndex !== index))}>Retirer</button></li>)}</ul>}
  </section>
}
