import { ConfirmDialog } from '../common/ConfirmDialog'

interface DeleteConfirmationProps {
  entityName: string
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConfirmation({ entityName, isDeleting, onCancel, onConfirm }: DeleteConfirmationProps) {
  return <ConfirmDialog title={`Supprimer « ${entityName} » ?`} message="Les associations avec les POI seront également retirées. Cette action est définitive." confirmLabel={isDeleting ? 'Suppression…' : 'Supprimer définitivement'} busy={isDeleting} onCancel={onCancel} onConfirm={onConfirm} />
}
