import { MapPinned, Pencil, Trash2, X } from 'lucide-react'

interface Props { googleMapsUrl: string | null; isDeleting: boolean; canEdit?: boolean; showClose?: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void }

export function PlacePopupActions({ googleMapsUrl, isDeleting, canEdit = true, showClose = true, onEdit, onDelete, onClose }: Props) {
  return <div className="popup-actions" aria-label="Actions du POI">
    {canEdit && <button type="button" aria-label="Modifier le POI" title="Modifier" disabled={isDeleting} onClick={onEdit}><Pencil aria-hidden="true" size={17} /><span>Éditer</span></button>}
    {canEdit && <button className="popup-action-delete" type="button" aria-label="Supprimer le POI" title="Supprimer" disabled={isDeleting} onClick={onDelete}><Trash2 aria-hidden="true" size={17} /><span>Supprimer</span></button>}
    {googleMapsUrl && <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir dans Google Maps" title="Ouvrir dans Google Maps"><MapPinned aria-hidden="true" size={17} /><span>Ouvrir dans Google Maps</span></a>}
    {showClose && <button type="button" aria-label="Fermer la fiche" title="Fermer" disabled={isDeleting} onClick={onClose}><X aria-hidden="true" size={17} /><span>Fermer</span></button>}
  </div>
}
