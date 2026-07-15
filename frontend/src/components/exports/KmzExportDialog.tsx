import { Download, FileArchive, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { createKmzExport, downloadKmzExport, type KmzExportCreated } from '../../api/exports'
import type { PoiMap } from '../../types/map'

const FIELDS = ['description', 'status', 'primary_category', 'categories', 'tags', 'region', 'construction_date', 'abandonment_date', 'condition', 'access', 'danger_level', 'created_at', 'updated_at']

export function KmzExportDialog({ poiMap, onClose }: { poiMap: PoiMap; onClose: () => void }) {
  const [includeImages, setIncludeImages] = useState(true)
  const [includeCustomFields, setIncludeCustomFields] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<KmzExportCreated | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generate = async () => { setBusy(true); setError(null); try { setResult(await createKmzExport(poiMap.id, { fields: FIELDS, include_images: includeImages, include_custom_fields: includeCustomFields })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Génération impossible.') } finally { setBusy(false) } }
  const download = async () => { if (!result) return; try { const blob = await downloadKmzExport(result.download_url); const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = result.file_name; link.click(); URL.revokeObjectURL(href) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Téléchargement impossible.') } }
  return createPortal(<div className="cv-overlay" role="presentation"><section className="kmz-import-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="kmz-export-title"><header className="kmz-import-dialog__header"><div><p className="cv-workspace-panel__eyebrow">Export de données</p><h2 id="kmz-export-title">Exporter un KMZ</h2><p>Carte : <strong>{poiMap.name}</strong></p></div><button className="panel-icon-button" type="button" aria-label="Fermer l’export" onClick={onClose}><X size={18} /></button></header>{error && <p className="form-alert" role="alert">{error}</p>}{result ? <div className="kmz-import-report"><h3>Export prêt</h3><p>{result.report.exported_places} POI exportés · {result.report.included_images} images intégrées</p>{result.report.warnings.map((warning) => <p className="kmz-import-warning" key={warning}>{warning}</p>)}<button className="primary-button" type="button" onClick={() => void download()}><Download size={16} />Télécharger le KMZ</button></div> : <div className="kmz-import-preview"><p>Le nom et les coordonnées sont toujours inclus. Les catégories et statuts sont exportés sans filtre.</p><label className="kmz-import-remote-option"><input type="checkbox" checked={includeCustomFields} onChange={(event) => setIncludeCustomFields(event.target.checked)} />Inclure les données personnalisées</label><label className="kmz-import-remote-option"><input type="checkbox" checked={includeImages} onChange={(event) => setIncludeImages(event.target.checked)} />Inclure les images locales</label><footer className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Annuler</button><button className="primary-button" type="button" disabled={busy} onClick={() => void generate()}><FileArchive size={16} />{busy ? 'Génération…' : 'Générer le KMZ'}</button></footer></div>}</section></div>, document.body)
}
