import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Plus, Upload, X } from 'lucide-react'

import { validatePhotoFile } from './photoUtils'
import { FieldHelp } from '../common/FieldHelp'

interface Props { files: File[]; onChange: (files: File[]) => void; disabled?: boolean; headerAction?: ReactNode; compact?: boolean }

export function PendingPhotoPreviews({ files, onRemove, disabled = false }: { files: File[]; onRemove: (index: number) => void; disabled?: boolean }) {
  const previews = useState(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })))[0]
  const previousFiles = useRef(files)
  const [items, setItems] = useState(previews)
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    if (previousFiles.current === files) return
    previousFiles.current = files
    setItems((current) => {
      const next = files.map((file) => current.find((item) => item.file === file) ?? { file, url: URL.createObjectURL(file) })
      current.filter((item) => !next.some((candidate) => candidate === item)).forEach((item) => URL.revokeObjectURL(item.url))
      return next
    })
  }, [files])
  useEffect(() => () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)) }, [])
  return <ul className="photo-upload-previews" aria-label="Photos en attente d’envoi" aria-live="polite">{items.map(({ file, url }, index) => <li key={`${file.name}-${index}`}><img src={url} alt="" /><span className="photo-upload-previews__pending">En attente</span><button type="button" className="photo-upload-remove" disabled={disabled} aria-label={`Retirer ${file.name} de l’envoi`} title="Retirer de l’envoi" onClick={() => onRemove(index)}><X size={16} /></button><p title={file.name}>{file.name}</p></li>)}</ul>
}

export function PhotoUploader({ files, onChange, disabled = false, headerAction, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropActive, setDropActive] = useState(false)
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { pendingPhotos: files.length > 0 } }))
  }, [files.length])
  const addFiles = (incoming: FileList | File[]) => onChange([...files, ...Array.from(incoming).filter((file) => validatePhotoFile(file) === null)])
  return <section className={`${compact ? '' : 'form-section '}photo-uploader${dropActive ? ' is-drop-active' : ''}`} aria-labelledby="photo-upload-title" onDragEnter={(event) => { if (compact) return; event.preventDefault(); setDropActive(true) }} onDragOver={(event) => { if (!compact) event.preventDefault() }} onDragLeave={(event) => { if (!compact && !event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }} onDrop={(event) => { if (compact) return; event.preventDefault(); event.stopPropagation(); setDropActive(false); addFiles(event.dataTransfer.files) }}>
    {!compact && <div className="photo-uploader-heading"><div><h3 id="photo-upload-title">Photos<FieldHelp>JPEG, PNG ou WebP, 20 Mio maximum par fichier.</FieldHelp></h3></div><div className="photo-uploader-actions"><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} /><button className="photo-upload-button" type="button" disabled={disabled} aria-label="Ajouter des photos" title="Ajouter des photos" onClick={() => inputRef.current?.click()}><Camera aria-hidden="true" size={19} /><Plus aria-hidden="true" size={12} className="photo-upload-plus" /></button>{headerAction}</div></div>}
    {compact && <><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} />{files.length === 0 && <button className="photo-uploader__empty" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}><Upload size={20} /><strong>Aucune photo ajoutée</strong><span>Glissez vos photos ici ou cliquez pour parcourir.</span><small>JPEG, PNG ou WebP · 20 Mio maximum par fichier</small></button>}</>}
    {files.length === 0 && !compact && <p className="photo-uploader__drop-hint">Glissez vos photos ici</p>}
    {files.length > 0 && <PendingPhotoPreviews files={files} disabled={disabled} onRemove={(index) => onChange(files.filter((_, currentIndex) => currentIndex !== index))} />}
  </section>
}
