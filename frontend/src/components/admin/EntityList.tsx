export interface ManagedEntity {
  id: string
  name: string
  description?: string | null
}

interface EntityListProps {
  entities: ManagedEntity[]
  emptyMessage: string
  onEdit: (entity: ManagedEntity) => void
  onDelete: (entity: ManagedEntity) => void
}

export function EntityList({ entities, emptyMessage, onEdit, onDelete }: EntityListProps) {
  if (entities.length === 0) return <p className="admin-empty">{emptyMessage}</p>

  return (
    <ul className="admin-entity-list">
      {entities.map((entity) => (
        <li key={entity.id}>
          <div className="entity-summary">
            <strong>{entity.name}</strong>
            {'description' in entity && entity.description && <p>{entity.description}</p>}
          </div>
          <div className="entity-actions">
            <button className="secondary-button" type="button" onClick={() => onEdit(entity)}>Modifier {entity.name}</button>
            <button className="danger-button" type="button" onClick={() => onDelete(entity)}>Supprimer {entity.name}</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
