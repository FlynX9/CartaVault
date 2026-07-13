import { useEffect, useRef } from 'react'

interface DeleteConfirmationProps {
  entityName: string
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConfirmation({ entityName, isDeleting, onCancel, onConfirm }: DeleteConfirmationProps) {
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelButton.current?.focus(), [])

  return (
    <div className="delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
      <h3 id="delete-title">Confirmer la suppression</h3>
      <p id="delete-description">Supprimer « {entityName} » ? Les associations avec les POI seront également retirées.</p>
      <div className="admin-form-actions">
        <button className="danger-button" type="button" disabled={isDeleting} onClick={onConfirm}>
          {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
        <button ref={cancelButton} className="secondary-button" type="button" disabled={isDeleting} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
