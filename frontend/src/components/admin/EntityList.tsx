import { FolderOpen, Pencil, Trash2 } from 'lucide-react'

import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { EmptyState } from '../common/EmptyState'

export interface ManagedEntity {
  id: string
  name: string
  description?: string | null
  icon?: string
  marks_as_visited?: boolean
  color?: string
  places_count: number
}

interface EntityListProps {
  entities: ManagedEntity[]
  emptyMessage: string
  onEdit: (entity: ManagedEntity) => void
  onDelete: (entity: ManagedEntity) => void
  canDelete?: (entity: ManagedEntity) => boolean
  variant?: 'page' | 'panel'
  readOnly?: boolean
}

export function EntityList({ entities, emptyMessage, onEdit, onDelete, canDelete = () => true, variant = 'page', readOnly = false }: EntityListProps) {
  if (entities.length === 0) return <EmptyState className="admin-empty" icon={<FolderOpen size={24} />} title={emptyMessage} />

  return (
    <ul className={`admin-entity-list${variant === 'panel' ? ' cv-panel-entity-list' : ''}`}>
      {entities.map((entity) => (
        <li key={entity.id}>
          {variant === 'panel' && entity.icon && <CategoryIconPreview iconId={entity.icon} size={18} showLabel={false} />}
          {variant === 'panel' && entity.color && (
            <span className="entity-list-color" style={{ backgroundColor: entity.color }} aria-label={`Couleur ${entity.color}`} />
          )}
          <div className="entity-summary">
            <strong>{entity.name}</strong>
            {'description' in entity && entity.description && <p>{entity.description}</p>}
            {variant === 'panel' && <span className="entity-place-count" aria-label={`${entity.places_count} ${entity.places_count === 1 ? 'POI associé' : 'POI associés'}`}>{entity.places_count} POI</span>}
          </div>
          {!readOnly && (
            <div className="entity-actions">
              {variant === 'panel' ? (
                <>
                  <button className="panel-icon-button" type="button" aria-label={`Modifier ${entity.name}`} title={`Modifier ${entity.name}`} onClick={() => onEdit(entity)}><Pencil size={16} /></button>
                  {canDelete(entity) && <button className="panel-icon-button danger" type="button" aria-label={`Supprimer ${entity.name}`} title={`Supprimer ${entity.name}`} onClick={() => onDelete(entity)}><Trash2 size={16} /></button>}
                </>
              ) : (
                <>
                  <button className="secondary-button" type="button" onClick={() => onEdit(entity)}>Modifier {entity.name}</button>
                  {canDelete(entity) && <button className="danger-button" type="button" onClick={() => onDelete(entity)}>Supprimer {entity.name}</button>}
                </>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
