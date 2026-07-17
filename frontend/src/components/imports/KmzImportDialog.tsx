import { CheckSquare, FileArchive, ShieldAlert, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { confirmKmzImport, previewKmzImport } from '../../api/imports'
import type { PoiMap } from '../../types/map'
import type { KmzImportProgress, KmzImportReport, KmzPreview } from '../../types/imports'

interface Props {
  poiMap: PoiMap
  onClose: () => void
  onImported: () => void
}

type Step = 'upload' | 'analyzing' | 'preview' | 'confirming' | 'report'

function fileSize(bytes: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'short',
    notation: 'compact',
  }).format(bytes)
}

export function KmzImportDialog({ poiMap, onClose, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<KmzPreview | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [forced, setForced] = useState<number[]>([])
  const [report, setReport] = useState<KmzImportReport | null>(null)
  const [downloadRemoteImages, setDownloadRemoteImages] = useState(false)
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<KmzImportProgress | null>(null)

  const analyze = async (candidate: File) => {
    setStep('analyzing')
    setError(null)
    try {
      const nextPreview = await previewKmzImport(poiMap.id, candidate)
      setPreview(nextPreview)
      setSelected(nextPreview.items.filter((item) => item.selected_by_default && item.importable && !item.already_imported).map((item) => item.source_index))
      setForced([])
      setStep('preview')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analyse du KMZ impossible.')
      setStep('upload')
    }
  }

  const chooseFile = (candidate: File | null) => {
    setError(null)
    setPreview(null)
    setReport(null)
    setForced([])
    if (candidate && !candidate.name.toLowerCase().endsWith('.kmz')) {
      setFile(null)
      setError('Choisissez un fichier KMZ (.kmz).')
      return
    }
    setFile(candidate)
    if (candidate) void analyze(candidate)
  }

  const confirm = async () => {
    if (!preview) return
    setStep('confirming')
    setError(null)
    setProgress({ status: 'pending', completed: 0, total: 1, percent: 0, message: 'Préparation de l’import' })
    try {
      const nextReport = await confirmKmzImport(
        poiMap.id,
        preview.import_id,
        selected,
        downloadRemoteImages,
        forced,
        setProgress,
      )
      setReport(nextReport)
      setStep('report')
      onImported()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'import est impossible.")
      setStep('preview')
    }
  }

  const toggle = (index: number) => {
    setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])
    setForced((current) => current.filter((item) => item !== index))
  }
  const forceImport = (index: number) => {
    setSelected((current) => current.includes(index) ? current : [...current, index])
    setForced((current) => current.includes(index) ? current : [...current, index])
  }
  const forceAllDuplicates = () => {
    const duplicateIndexes = preview?.items
      .filter((item) => item.already_imported && item.latitude !== null && item.longitude !== null && item.errors.length === 0)
      .map((item) => item.source_index) ?? []
    setSelected((current) => [...new Set([...current, ...duplicateIndexes])])
    setForced((current) => [...new Set([...current, ...duplicateIndexes])])
  }
  const toggleAll = () => setSelected(preview?.items.filter((item) => item.importable && !item.errors.length).map((item) => item.source_index) ?? [])

  return createPortal(
    <div className="cv-overlay kmz-import-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="kmz-import-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="kmz-import-title">
        <header className="kmz-import-dialog__header">
          <div>
            <p className="cv-workspace-panel__eyebrow">Import de données</p>
            <h2 id="kmz-import-title">Importer un KMZ</h2>
            <p>Carte cible : <strong>{poiMap.name}</strong></p>
          </div>
          <button className="panel-icon-button" type="button" aria-label="Fermer l’import" onClick={onClose}><X size={18} /></button>
        </header>
        {error && <p className="form-alert" role="alert">{error}</p>}
        {step === 'upload' && <div className="kmz-import-upload">
          <input ref={input} className="visually-hidden" type="file" accept=".kmz,application/vnd.google-earth.kmz" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          <button className="kmz-import-dropzone" type="button" onClick={() => input.current?.click()}>
            <FileArchive size={30} />
            <span>{file ? file.name : 'Choisir un fichier KMZ'}</span>
            <small>{file ? fileSize(file.size) : 'L’analyse démarre automatiquement après la sélection.'}</small>
          </button>
        </div>}
        {step === 'analyzing' && <p className="kmz-import-state" role="status">Analyse du fichier en cours…</p>}
        {step === 'preview' && preview && <div className="kmz-import-preview">
          <div className="kmz-import-summary"><strong>{preview.valid_count} point{preview.valid_count > 1 ? 's' : ''} importable{preview.valid_count > 1 ? 's' : ''}</strong><span>{preview.warning_count} avertissement{preview.warning_count > 1 ? 's' : ''}</span><span>{preview.error_count} erreur{preview.error_count > 1 ? 's' : ''}</span></div>
          {preview.global_warnings.map((warning) => <p className="kmz-import-warning" key={warning}>{warning}</p>)}
          <label className="kmz-import-remote-option"><input type="checkbox" checked={downloadRemoteImages} onChange={(event) => setDownloadRemoteImages(event.target.checked)} />Tenter de télécharger les images distantes Google My Maps<small>Certaines images peuvent nécessiter une authentification Google ou ne plus être disponibles. Les POI seront quand même importés si leur image échoue.</small></label>
          <div className="kmz-import-toolbar"><button type="button" onClick={toggleAll}><CheckSquare size={16} />Tout sélectionner</button><button type="button" onClick={() => { setSelected([]); setForced([]) }}>Tout désélectionner</button>{preview.items.some((item) => item.already_imported) && <button className="kmz-import-force-all-button" type="button" onClick={forceAllDuplicates} disabled={preview.items.filter((item) => item.already_imported).every((item) => forced.includes(item.source_index))}><ShieldAlert size={16} />{preview.items.filter((item) => item.already_imported).every((item) => forced.includes(item.source_index)) ? 'Tous les doublons sont forcés' : `Forcer tous les doublons (${preview.items.filter((item) => item.already_imported).length})`}</button>}</div>
          <ul className="kmz-import-items">{preview.items.map((item) => {
            const isForced = forced.includes(item.source_index)
            return <li key={item.source_index} className={!item.importable ? 'invalid' : ''}>
              <label><input type="checkbox" checked={selected.includes(item.source_index)} disabled={!item.importable} onChange={() => toggle(item.source_index)} /><span><strong>{item.name ?? `Point ${item.source_index + 1}`}</strong><small>{item.latitude?.toFixed(6) ?? '—'}, {item.longitude?.toFixed(6) ?? '—'} · {item.images.length} image{item.images.length > 1 ? 's' : ''}</small></span></label>
              {item.already_imported && <button className="kmz-import-force-button" type="button" onClick={() => forceImport(item.source_index)} disabled={isForced}>{isForced ? 'Import forcé' : <><ShieldAlert size={15} />Forcer l’import</>}</button>}
              {item.duplicate_reason && <small className="kmz-import-duplicate-reason">{item.duplicate_reason === 'within_file' ? 'Même nom et mêmes coordonnées dans ce fichier' : 'Même nom et mêmes coordonnées sur la carte'}</small>}
              {item.images.map((image) => <small key={image.internal_id}>{image.source_type === 'remote_supported' ? `Image distante Google My Maps (${image.host})` : image.source_type}</small>)}
              {Object.keys(item.custom_fields).length > 0 && <details><summary>Données importées ({Object.keys(item.custom_fields).length})</summary><dl>{Object.entries(item.custom_fields).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : value}</dd></div>)}</dl></details>}
              {[...item.warnings, ...item.errors].map((message) => <p className={item.errors.includes(message) ? 'kmz-import-error' : 'kmz-import-warning'} key={message}>{message}</p>)}
            </li>
          })}</ul>
          <footer className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setStep('upload')}>Retour</button><button className="primary-button" type="button" disabled={!selected.length} onClick={() => void confirm()}>Importer {selected.length} POI</button></footer>
        </div>}
        {step === 'confirming' && <div className="kmz-import-state" role="status" aria-live="polite">
          <strong>Import en cours…</strong>
          <div className="kmz-import-progress" role="progressbar" aria-label="Progression de l’import" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.percent ?? 0}>
            <span style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <p>{progress?.message ?? 'Préparation de l’import'}</p>
          <small>{progress?.percent ?? 0} % · {progress?.completed ?? 0}/{progress?.total ?? 1}</small>
        </div>}
        {step === 'report' && report && <div className="kmz-import-report"><h3>Import terminé</h3><p><strong>{report.created_count}</strong> POI créés, <strong>{report.images_added}</strong> images ajoutées.</p>{report.warnings.map((warning) => <p className="kmz-import-warning" key={warning}>{warning}</p>)}<button className="primary-button" type="button" onClick={onClose}>Fermer</button></div>}
      </section>
    </div>,
    document.body,
  )
}
