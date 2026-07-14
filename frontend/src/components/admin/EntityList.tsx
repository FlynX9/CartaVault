import { Pencil, Trash2 } from 'lucide-react'

import { CategoryIconPreview } from '../icons/CategoryIconPreview'

export interface ManagedEntity { id: string; name: string; description?: string | null; icon?: string }
interface EntityListProps { entities: ManagedEntity[]; emptyMessage: string; onEdit: (entity: ManagedEntity) => void; onDelete: (entity: ManagedEntity) => void; variant?: 'page' | 'panel' }

export function EntityList({ entities, emptyMessage, onEdit, onDelete, variant = 'page' }: EntityListProps) {
  if (entities.length === 0) return <p className="admin-empty">{emptyMessage}</p>
  return <ul className={`admin-entity-list${variant === 'panel' ? ' cv-panel-entity-list' : ''}`}>{entities.map((entity) => <li key={entity.id}>{variant === 'panel' && entity.icon && <CategoryIconPreview iconId={entity.icon} size={18} showLabel={false} />}<div className="entity-summary"><strong>{entity.name}</strong>{'description' in entity && entity.description && <p>{entity.description}</p>}</div><div className="entity-actions">{variant === 'panel' ? <><button className="panel-icon-button" type="button" aria-label={`Modifier ${entity.name}`} title={`Modifier ${entity.name}`} onClick={() => onEdit(entity)}><Pencil size={16} /></button><button className="panel-icon-button danger" type="button" aria-label={`Supprimer ${entity.name}`} title={`Supprimer ${entity.name}`} onClick={() => onDelete(entity)}><Trash2 size={16} /></button></> : <><button className="secondary-button" type="button" onClick={() => onEdit(entity)}>Modifier {entity.name}</button><button className="danger-button" type="button" onClick={() => onDelete(entity)}>Supprimer {entity.name}</button></>}</div></li>)}</ul>
}
