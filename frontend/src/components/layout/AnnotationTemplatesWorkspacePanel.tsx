import { useEffect, useMemo, useState } from 'react'
import { Check, GripVertical, Pencil, Plus, Spline, Trash2, X } from 'lucide-react'
import type { DragEvent } from 'react'

import { createAnnotationTemplate, deleteAnnotationTemplate, getAnnotationTemplates, reorderAnnotationTemplates, updateAnnotationTemplate } from '../../api/annotations'
import type { AnnotationShapeType, AnnotationTemplate } from '../../types/annotation'
import { CategoryIconField } from '../icons/CategoryIconField'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { WorkspacePanelHeader } from './WorkspacePanelHeader'
import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'
import { WorkspaceSearchField } from '../admin/WorkspaceSearchField'

const shapes: Array<{ value: AnnotationShapeType; label: string }> = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'circle', label: 'Cercle' },
  { value: 'line', label: 'Ligne' },
  { value: 'path', label: 'Chemin' },
]

export function AnnotationTemplatesWorkspacePanel({ mapId, canEdit = true, collapsed = false, onCollapsedChange = () => undefined }: { mapId?: string; canEdit?: boolean; collapsed?: boolean; onCollapsedChange?: (collapsed: boolean) => void }) {
  const [items, setItems] = useState<AnnotationTemplate[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AnnotationTemplate | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [shapeType, setShapeType] = useState<AnnotationShapeType>('rectangle')
  const [icon, setIcon] = useState('tabler:map-pin')
  const [color, setColor] = useState('#0FA68A')
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr')
    if (!query) return items
    return items.filter((item) => {
      const shapeLabel = shapes.find((shape) => shape.value === item.shape_type)?.label ?? item.shape_type
      return `${item.name} ${shapeLabel}`.toLocaleLowerCase('fr').includes(query)
    })
  }, [items, search])

  const load = () => {
    if (!mapId) return
    void getAnnotationTemplates(mapId).then(setItems).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Chargement impossible.'))
  }
  useEffect(load, [mapId])

  const edit = (item: AnnotationTemplate | null) => {
    setEditing(item)
    setName(item?.name ?? '')
    setShapeType(item?.shape_type ?? 'rectangle')
    setIcon(item?.icon ?? 'tabler:map-pin')
    setColor(item?.color ?? '#0FA68A')
    setActive(item?.is_active ?? true)
    setError(null)
  }

  const save = async () => {
    if (!mapId || !name.trim()) return
    try {
      if (editing === null) await createAnnotationTemplate({ map_id: mapId, name: name.trim(), shape_type: shapeType, icon, color, sort_order: items.length, is_active: active })
      else if (editing) await updateAnnotationTemplate(editing.id, { name: name.trim(), ...(editing.usage_count === 0 ? { shape_type: shapeType } : {}), icon, color, is_active: active })
      setEditing(undefined)
      load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
    }
  }

  const remove = async (item: AnnotationTemplate) => {
    try { await deleteAnnotationTemplate(item.id); load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Suppression impossible.') }
  }

  const drop = async (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault()
    if (!mapId || !draggedId || draggedId === targetId) return
    const previous = items
    const ids = items.map((item) => item.id).filter((id) => id !== draggedId)
    const targetIndex = ids.indexOf(targetId)
    ids.splice(targetIndex + (dropTarget?.position === 'after' ? 1 : 0), 0, draggedId)
    const byId = new Map(items.map((item) => [item.id, item]))
    setItems(ids.map((id) => byId.get(id)).filter((item): item is AnnotationTemplate => item !== undefined))
    setDraggedId(null)
    setDropTarget(null)
    try { setItems(await reorderAnnotationTemplates(mapId, ids)) }
    catch (caught) { setItems(previous); setError(caught instanceof Error ? caught.message : 'Réorganisation impossible.') }
  }

  return <aside id="workspace-annotation-templates-panel" className={`country-place-panel workspace-management-panel cv-workspace-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Modèles d’annotation" tabIndex={-1}>
    <WorkspacePanelCloseContext.Provider value={{ collapsed, onToggleCollapsed: () => onCollapsedChange(!collapsed) }}>
      <section className="admin-page cv-management-panel">
        <WorkspacePanelHeader eyebrow="Organisation" title="Annotations" count={`${items.length} élément${items.length > 1 ? 's' : ''}`} action={canEdit ? <button className="panel-icon-button primary panel-create-action" type="button" aria-label="Nouveau modèle d’annotation" title="Nouveau modèle" onClick={() => edit(null)}><Plus size={18} /></button> : undefined} />
        <WorkspaceSearchField value={search} placeholder="Rechercher une annotation" onChange={setSearch} />
        {error && <p className="form-alert" role="alert">{error}</p>}
        {editing !== undefined && canEdit && <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <h3>{editing === null ? 'Nouveau modèle' : 'Modifier le modèle'}</h3>
          <label className="form-field"><span>Nom *</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
          <label className="form-field"><span>Forme</span><select value={shapeType} disabled={editing !== null && editing.usage_count > 0} onChange={(event) => setShapeType(event.target.value as AnnotationShapeType)}>{shapes.map((shape) => <option key={shape.value} value={shape.value}>{shape.label}</option>)}</select>{editing !== null && editing.usage_count > 0 && <small>La forme est verrouillée car ce modèle est utilisé.</small>}</label>
          <CategoryIconField value={icon} onChange={setIcon} />
          <label className="form-field status-color-field"><span>Couleur</span><span className="cv-status-color-swatch" style={{ backgroundColor: color }}><input className="cv-status-color-input" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></span></label>
          <label className="checkbox-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Modèle actif</span></label>
          <div className="admin-form-actions"><button className="primary-button" data-cv-save="true" type="submit"><Check size={15} />Enregistrer</button><button className="secondary-button" type="button" onClick={() => setEditing(undefined)}><X size={15} />Annuler</button></div>
        </form>}
        <ul className="admin-entity-list cv-panel-status-list cv-panel-annotation-list cv-workspace-panel__list">{visibleItems.map((item) => <li
          className={`cv-workspace-panel__card${draggedId === item.id ? ' is-dragging' : ''}${dropTarget?.id === item.id ? ` is-drop-${dropTarget.position}` : ''}`}
          key={item.id}
          draggable={canEdit && !search}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggedId(item.id) }}
          onDragOver={(event) => { if (canEdit && draggedId !== item.id) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' }) } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current?.id === item.id ? null : current) }}
          onDrop={(event) => void drop(event, item.id)}
          onDragEnd={() => { setDraggedId(null); setDropTarget(null) }}
        >
          <div className="cv-mobile-swipe-entity__row">
            {canEdit && !search && <GripVertical className="status-drag-handle" size={16} aria-hidden="true" />}
            <div className="status-summary">
              <span className="annotation-template-list__icon" style={{ backgroundColor: item.color }}><CategoryIconPreview iconId={item.icon} size={20} showLabel={false} /></span>
              <div><strong>{item.name}</strong><span className="status-row-state-text">{shapes.find((shape) => shape.value === item.shape_type)?.label}</span></div>
            </div>
            <div className="status-row-labels">
              {!item.is_active && <b className="account-integration-state is-neutral">Inactif</b>}
              <span className="annotation-usage-count account-integration-state is-neutral"><Spline aria-hidden="true" />{item.usage_count} tracé{item.usage_count > 1 ? 's' : ''}</span>
            </div>
            {canEdit && <div className="entity-actions"><button className="panel-icon-button" type="button" aria-label={`Modifier ${item.name}`} title={`Modifier ${item.name}`} onClick={() => edit(item)}><Pencil size={16} /></button><button className="panel-icon-button danger" type="button" aria-label={`Supprimer ${item.name}`} title={item.usage_count ? 'Désactiver dans les réglages' : `Supprimer ${item.name}`} disabled={item.usage_count > 0} onClick={() => void remove(item)}><Trash2 size={16} /></button></div>}
          </div>
        </li>)}</ul>
      </section>
    </WorkspacePanelCloseContext.Provider>
  </aside>
}
