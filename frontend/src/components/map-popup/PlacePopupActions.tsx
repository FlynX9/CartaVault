import { CalendarPlus, MapPinned, Pencil, Trash2, X } from "lucide-react";
import { GoogleMapsIcon } from "../common/GoogleMapsIcon";

interface Props {
  googleMapsUrl: string | null;
  isDeleting: boolean;
  canEdit?: boolean;
  showManagementActions?: boolean;
  showClose?: boolean;
  tripAddTargetLabel?: string | null;
  canChooseTripDay?: boolean;
  isAddingToTrip?: boolean;
  onAddToTrip?: () => void;
  onShowOnMap?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function PlacePopupActions({
  googleMapsUrl,
  isDeleting,
  canEdit = true,
  showManagementActions = true,
  showClose = true,
  tripAddTargetLabel = null,
  canChooseTripDay = false,
  isAddingToTrip = false,
  onAddToTrip = () => undefined,
  onShowOnMap,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  return (
    <div className="popup-actions" aria-label="Actions du POI">
      {(tripAddTargetLabel || canChooseTripDay) && (
        <button
          className="popup-action-add-to-trip"
          type="button"
          aria-label={tripAddTargetLabel ?? "Choisir une journée de sortie"}
          title={tripAddTargetLabel ?? "Choisir une journée de sortie"}
          disabled={isDeleting || isAddingToTrip}
          onClick={onAddToTrip}
        >
          <CalendarPlus aria-hidden="true" size={17} />
          <span>
            {isAddingToTrip
              ? "Ajout…"
              : (tripAddTargetLabel ?? "Choisir une journée")}
          </span>
        </button>
      )}
      {canEdit && showManagementActions && (
        <button
          type="button"
          aria-label="Modifier le POI"
          title="Modifier"
          disabled={isDeleting}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" size={17} />
          <span>Éditer</span>
        </button>
      )}
      {canEdit && showManagementActions && (
        <button
          className="popup-action-delete"
          type="button"
          aria-label="Supprimer le POI"
          title="Supprimer"
          disabled={isDeleting}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" size={17} />
          <span>Supprimer</span>
        </button>
      )}
      {onShowOnMap && (
        <button
          className="popup-action-show-on-map"
          type="button"
          aria-label="Afficher sur la carte"
          title="Afficher sur la carte"
          onClick={onShowOnMap}
        >
          <MapPinned aria-hidden="true" size={17} />
          <span>Afficher sur la carte</span>
        </button>
      )}
      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir dans Google Maps"
          title="Ouvrir dans Google Maps"
        >
          <GoogleMapsIcon size={24} />
          <span>Ouvrir dans Google Maps</span>
        </a>
      )}
      {showClose && (
        <button
          type="button"
          aria-label="Fermer la fiche"
          title="Fermer"
          disabled={isDeleting}
          onClick={onClose}
        >
          <X aria-hidden="true" size={17} />
          <span>Fermer</span>
        </button>
      )}
    </div>
  );
}
