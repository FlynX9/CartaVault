import { FolderOpen, GripVertical, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { EmptyState } from '../common/EmptyState'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

export interface ManagedEntity {
  id: string
  name: string
  description?: string | null
  icon?: string
  marks_as_visited?: boolean
  color?: string
  places_count: number
  sort_order?: number
}

interface EntityListProps {
  entities: ManagedEntity[]
  emptyMessage: string
  onEdit: (entity: ManagedEntity) => void
  onDelete: (entity: ManagedEntity) => void
  onReorder?: (ids: string[]) => void | Promise<void>
  canDelete?: (entity: ManagedEntity) => boolean
  variant?: 'page' | 'panel'
  readOnly?: boolean
}

export function EntityList({ entities, emptyMessage, onEdit, onDelete, onReorder, canDelete = () => true, variant = 'page', readOnly = false }: EntityListProps) {
  const swipeStart = useRef<{ id: string; pointerId: number; x: number } | null>(null)
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null)
  const [revealed, setRevealed] = useState<{ id: string; direction: 'delete' | 'edit' } | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const reorderEnabled = variant === 'panel' && !readOnly && onReorder !== undefined

  const startSwipe = (event: ReactPointerEvent<HTMLLIElement>, entityId: string) => {
    if (variant !== 'panel' || event.pointerType === 'mouse' || (event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    swipeStart.current = { id: entityId, pointerId: event.pointerId, x: event.clientX }
    const offset = revealed?.id === entityId ? revealed.direction === 'delete' ? 86 : -70 : 0
    setSwipe({ id: entityId, offset })
    if (revealed?.id !== entityId) setRevealed(null)
  }
  const moveSwipe = (event: ReactPointerEvent<HTMLLIElement>) => {
    const current = swipeStart.current
    if (!current || current.pointerId !== event.pointerId) return
    const base = revealed?.id === current.id ? revealed.direction === 'delete' ? 86 : -70 : 0
    const offset = Math.max(-78, Math.min(94, event.clientX - current.x + base))
    if (Math.abs(offset) > 6) event.preventDefault()
    setSwipe({ id: current.id, offset })
  }
  const endSwipe = (event: ReactPointerEvent<HTMLLIElement>) => {
    const current = swipeStart.current
    if (!current || current.pointerId !== event.pointerId) return
    const offset = swipe?.id === current.id ? swipe.offset : 0
    swipeStart.current = null
    setSwipe(null)
    setRevealed(Math.abs(offset) >= 38 ? { id: current.id, direction: offset > 0 ? 'delete' : 'edit' } : null)
  }
  const dragOver = (event: DragEvent<HTMLLIElement>, entityId: string) => {
    if (!draggedId || draggedId === entityId) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    setDropTarget({ id: entityId, position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' })
  }
  const drop = (event: DragEvent<HTMLLIElement>, entityId: string) => {
    event.preventDefault()
    if (!draggedId || draggedId === entityId || !onReorder) return
    const ids = entities.map((entity) => entity.id).filter((id) => id !== draggedId)
    const targetIndex = ids.indexOf(entityId)
    ids.splice(targetIndex + (dropTarget?.position === 'after' ? 1 : 0), 0, draggedId)
    setDraggedId(null)
    setDropTarget(null)
    void onReorder(ids)
  }

  if (entities.length === 0) return <EmptyState className="admin-empty" icon={<FolderOpen size={24} />} title={emptyMessage} />

  return (
    <ul className={`admin-entity-list${variant === 'panel' ? ' cv-panel-entity-list' : ''}`}>
      {entities.map((entity) => (
        <li key={entity.id} className={`cv-mobile-swipe-entity${draggedId === entity.id ? ' is-dragging' : ''}${dropTarget?.id === entity.id ? ` is-drop-${dropTarget.position}` : ''}`} draggable={reorderEnabled} onDragStart={(event) => { setDraggedId(entity.id); event.dataTransfer.effectAllowed = 'move' }} onDragOver={(event) => dragOver(event, entity.id)} onDrop={(event) => drop(event, entity.id)} onDragEnd={() => { setDraggedId(null); setDropTarget(null) }} onPointerDown={(event) => startSwipe(event, entity.id)} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={() => { swipeStart.current = null; setSwipe(null) }}>
          {variant === 'panel' && !readOnly && canDelete(entity) && <button className="cv-mobile-swipe-entity__delete" type="button" aria-hidden={!(revealed?.id === entity.id && revealed.direction === 'delete')} tabIndex={revealed?.id === entity.id && revealed.direction === 'delete' ? 0 : -1} aria-label={`Supprimer ${entity.name}`} onClick={() => onDelete(entity)}><Trash2 size={17} /></button>}
          {variant === 'panel' && !readOnly && <button className="cv-mobile-swipe-entity__edit" type="button" aria-hidden={!(revealed?.id === entity.id && revealed.direction === 'edit')} tabIndex={revealed?.id === entity.id && revealed.direction === 'edit' ? 0 : -1} aria-label={`Modifier ${entity.name}`} onClick={() => onEdit(entity)}><Pencil size={17} /></button>}
          <div className="cv-mobile-swipe-entity__row" style={variant === 'panel' ? { transform: `translateX(${swipe?.id === entity.id ? swipe.offset : revealed?.id === entity.id ? revealed.direction === 'delete' ? 86 : -70 : 0}px)` } : undefined}>
            {reorderEnabled && <GripVertical className="entity-drag-handle" size={16} aria-hidden="true" />}
            {variant === 'panel' && entity.icon && <CategoryIconPreview iconId={entity.icon} size={28} showLabel={false} />}
            {variant === 'panel' && entity.color && <span className="entity-list-color" style={{ backgroundColor: entity.color }} aria-label={`Couleur ${entity.color}`} />}
            <div className={`entity-summary${!entity.description ? ' is-title-only' : ''}`}>
              <strong>{entity.name}</strong>
              {entity.description && <p>{entity.description}</p>}
            </div>
            {variant === 'panel' && <div className="entity-row-labels"><span className="entity-place-count account-integration-state is-neutral" aria-label={`${entity.places_count} ${entity.places_count === 1 ? 'POI associé' : 'POI associés'}`}><MapPin aria-hidden="true" />{entity.places_count} POI</span></div>}
            {!readOnly && <div className="entity-actions">{variant === 'panel' ? <><button className="panel-icon-button" type="button" aria-label={`Modifier ${entity.name}`} title={`Modifier ${entity.name}`} onClick={() => onEdit(entity)}><Pencil size={16} /></button><button className="panel-icon-button danger" type="button" aria-label={`Supprimer ${entity.name}`} title={`Supprimer ${entity.name}`} disabled={!canDelete(entity)} onClick={() => onDelete(entity)}><Trash2 size={16} /></button></> : <><button className="secondary-button" type="button" onClick={() => onEdit(entity)}>Modifier {entity.name}</button>{canDelete(entity) && <button className="danger-button" type="button" onClick={() => onDelete(entity)}>Supprimer {entity.name}</button>}</>}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
