import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'

import { createAnnotationTemplate, deleteAnnotationTemplate, getAnnotationTemplates, updateAnnotationTemplate } from '../../api/annotations'
import type { AnnotationShapeType, AnnotationTemplate } from '../../types/annotation'
import { WorkspacePanelHeader } from './WorkspacePanelHeader'
import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'

const shapes: Array<{ value: AnnotationShapeType; label: string }> = [
  { value: 'rectangle', label: 'Rectangle' }, { value: 'triangle', label: 'Triangle' }, { value: 'circle', label: 'Cercle' }, { value: 'line', label: 'Ligne' }, { value: 'path', label: 'Chemin' },
]

export function AnnotationTemplatesWorkspacePanel({ mapId, canEdit = true, collapsed = false, onCollapsedChange = () => undefined }: { mapId?: string; canEdit?: boolean; collapsed?: boolean; onCollapsedChange?: (collapsed: boolean) => void }) {
  const [items, setItems] = useState<AnnotationTemplate[]>([])
  const [editing, setEditing] = useState<AnnotationTemplate | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [shapeType, setShapeType] = useState<AnnotationShapeType>('rectangle')
  const [color, setColor] = useState('#0FA68A')
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = () => { if (!mapId) return; void getAnnotationTemplates(mapId).then(setItems).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Chargement impossible.')) }
  useEffect(load, [mapId])
  const edit = (item: AnnotationTemplate | null) => { setEditing(item); setName(item?.name ?? ''); setShapeType(item?.shape_type ?? 'rectangle'); setColor(item?.color ?? '#0FA68A'); setActive(item?.is_active ?? true); setError(null) }
  const save = async () => {
    if (!mapId || !name.trim()) return
    try {
      if (editing === null) await createAnnotationTemplate({ map_id: mapId, name: name.trim(), shape_type: shapeType, icon: 'tabler:map-pin', color, sort_order: items.length, is_active: active })
      else if (editing) await updateAnnotationTemplate(editing.id, { name: name.trim(), ...(editing.usage_count === 0 ? { shape_type: shapeType } : {}), color, is_active: active })
      setEditing(undefined); load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.') }
  }
  const remove = async (item: AnnotationTemplate) => { try { await deleteAnnotationTemplate(item.id); load() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') } }
  return <aside id="workspace-annotation-templates-panel" className={`country-place-panel workspace-management-panel cv-workspace-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Modèles d’annotation" tabIndex={-1}><WorkspacePanelCloseContext.Provider value={{ collapsed, onToggleCollapsed: () => onCollapsedChange(!collapsed) }}><section className="admin-page cv-management-panel"><WorkspacePanelHeader eyebrow="Organisation" title="Annotations" count={`${items.length} élément${items.length > 1 ? 's' : ''}`} action={canEdit ? <button className="panel-icon-button primary panel-create-action" type="button" aria-label="Nouveau modèle d’annotation" title="Nouveau modèle" onClick={() => edit(null)}><Plus size={18} /></button> : undefined} />{error && <p className="form-alert" role="alert">{error}</p>}{editing !== undefined && canEdit && <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void save() }}><h3>{editing === null ? 'Nouveau modèle' : 'Modifier le modèle'}</h3><label className="form-field"><span>Nom *</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label className="form-field"><span>Forme</span><select value={shapeType} disabled={editing !== null && editing.usage_count > 0} onChange={(event) => setShapeType(event.target.value as AnnotationShapeType)}>{shapes.map((shape) => <option key={shape.value} value={shape.value}>{shape.label}</option>)}</select>{editing !== null && editing.usage_count > 0 && <small>La forme est verrouillée car ce modèle est utilisé.</small>}</label><label className="form-field status-color-field"><span>Couleur</span><span className="cv-status-color-swatch" style={{ backgroundColor: color }}><input className="cv-status-color-input" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></span></label><label className="checkbox-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Modèle actif</span></label><div className="admin-form-actions"><button className="primary-button" data-cv-save="true" type="submit"><Check size={15} />Enregistrer</button><button className="secondary-button" type="button" onClick={() => setEditing(undefined)}><X size={15} />Annuler</button></div></form>}<ul className="annotation-template-list">{items.map((item) => <li key={item.id}><i style={{ background: item.color }} /><div><strong>{item.name}</strong><small>{shapes.find((shape) => shape.value === item.shape_type)?.label} · {item.usage_count} utilisation{item.usage_count > 1 ? 's' : ''}{!item.is_active ? ' · Inactif' : ''}</small></div>{canEdit && <><button className="panel-icon-button" type="button" title="Modifier" onClick={() => edit(item)}><Pencil size={15} /></button><button className="panel-icon-button danger" type="button" title={item.usage_count ? 'Désactiver dans les réglages' : 'Supprimer'} disabled={item.usage_count > 0} onClick={() => void remove(item)}><Trash2 size={15} /></button></>}</li>)}</ul></section></WorkspacePanelCloseContext.Provider></aside>
}
