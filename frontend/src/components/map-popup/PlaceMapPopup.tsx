import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Copy,
  Earth,
  FileText,
  Heart,
  History,
  MapPin,
  Star,
  TriangleAlert,
} from "lucide-react";
import { deletePlace, getPlaceDetails, getPlaceHistory, updatePlace } from "../../api/places";
import { getPlacePhotos, uploadPlacePhoto } from "../../api/photos";
import type { Photo } from "../../types/photo";
import type { PlaceDetails, PlaceHistoryEvent } from "../../types/place";
import { buildGoogleMapsUrl } from "../../utils/googleMaps";
import { CategoryIconPreview } from "../icons/CategoryIconPreview";
import { PlacePopupActions } from "./PlacePopupActions";
import { PlacePopupGallery } from "./PlacePopupGallery";
import { useConfirmDialog } from "../common/useConfirmDialog";
import { SkeletonList } from "../common/Skeleton";
import { getTagColorStyle } from "../../tags/tagColors";
import { formatMinutes } from "../trips/tripMetrics";

interface Props {
  placeId: string;
  canEdit?: boolean;
  showManagementActions?: boolean;
  tripAddTargetLabel?: string | null;
  tripDays?: Array<{ id: string; label: string }>;
  onAddToTrip?: (place: PlaceDetails, dayId?: string) => Promise<void> | void;
  onEdit: () => void;
  onDeleted: (placeId: string) => void;
  onClose: () => void;
}

const PASTE_SUCCESS_NOTICE = "Image ajoutée depuis le presse-papiers.";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function ratingFillPercentage(rating: number, star: number): number {
  return Math.max(0, Math.min(100, (rating - (star - 1)) * 100));
}

export function PlaceMapPopup({
  placeId,
  canEdit = true,
  showManagementActions = true,
  tripAddTargetLabel = null,
  tripDays = [],
  onAddToTrip = () => undefined,
  onEdit,
  onDeleted,
  onClose,
}: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [history, setHistory] = useState<PlaceHistoryEvent[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addingToTrip, setAddingToTrip] = useState(false);
  const [tripDayPickerOpen, setTripDayPickerOpen] = useState(false);
  const [targetDayId, setTargetDayId] = useState("");
  const [pasteUploading, setPasteUploading] = useState(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pasteTargetRef = useRef<HTMLTextAreaElement>(null);
  const previousPasteFocusRef = useRef<HTMLElement | null>(null);
  const pasteUploadingRef = useRef(false);
  const pasteUploadSequence = useRef(0);
  const pasteEventSeenAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    pasteUploadSequence.current += 1;
    pasteUploadingRef.current = false;
    setPasteUploading(false);
    setPasteNotice(null);
    setDetailsLoading(true);
    setPhotosLoading(true);
    setDetailsError(null);
    setPhotosError(null);
    void getPlaceDetails(placeId, controller.signal)
      .then(setPlace)
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setDetailsError(
            error instanceof Error ? error.message : "POI indisponible.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    void getPlacePhotos(placeId, controller.signal)
      .then(setPhotos)
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError"))
          setPhotosError(
            error instanceof Error ? error.message : "Photos indisponibles.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPhotosLoading(false);
      });
    return () => controller.abort();
  }, [placeId]);

  useEffect(() => {
    if (pasteNotice !== PASTE_SUCCESS_NOTICE) return;
    const timeout = window.setTimeout(() => {
      setPasteNotice((current) => current === PASTE_SUCCESS_NOTICE ? null : current);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [pasteNotice]);

  useEffect(() => {
    if (!historyOpen) return;
    const controller = new AbortController(); setHistoryLoading(true);
    void getPlaceHistory(placeId, {}, controller.signal).then((page) => { if (!controller.signal.aborted) setHistory(page.items ?? []) }).catch(() => { if (!controller.signal.aborted) setHistory([]) }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false) });
    return () => controller.abort();
  }, [historyOpen, placeId]);

  useEffect(() => {
    if (!place || detailsLoading) return;
    (canEdit ? pasteTargetRef.current : titleRef.current)?.focus({ preventScroll: true });
  }, [canEdit, detailsLoading, place]);

  useEffect(() => {
    if (!canEdit) return;
    const isPasteTarget = (target: EventTarget | null) => target instanceof HTMLElement && target.dataset.popupPasteTarget === "true";
    const isTextTarget = (target: EventTarget | null) => target instanceof HTMLElement && !isPasteTarget(target) && (target.matches("input, textarea, select") || target.isContentEditable);
    const restoreFocus = () => {
      const target = previousPasteFocusRef.current;
      previousPasteFocusRef.current = null;
      window.setTimeout(() => (target?.isConnected ? target : titleRef.current)?.focus({ preventScroll: true }), 0);
    };
    const uploadClipboardImage = (source: Blob) => {
      if (pasteUploadingRef.current) return;
      const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
      const extension = extensions[source.type];
      if (!extension) {
        setPasteNotice("Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.");
        return;
      }
      const file = new File([source], `presse-papiers-${Date.now()}.${extension}`, { type: source.type });
      const request = ++pasteUploadSequence.current;
      pasteUploadingRef.current = true;
      setPasteUploading(true);
      setPasteNotice("Ajout de l’image en cours…");
      void uploadPlacePhoto(placeId, file)
        .then((photo) => {
          if (pasteUploadSequence.current !== request) return;
          setPhotos((current) => current.some((item) => item.id === photo.id) ? current : [...current, photo]);
          setPhotosError(null);
          setPasteNotice(PASTE_SUCCESS_NOTICE);
        })
        .catch((error: unknown) => { if (pasteUploadSequence.current === request) setPasteNotice(error instanceof Error ? error.message : "Impossible d’ajouter cette image."); })
        .finally(() => { if (pasteUploadSequence.current === request) { pasteUploadingRef.current = false; setPasteUploading(false); } });
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return;
      pasteEventSeenAt.current = Date.now();
      const source = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"))
        ?? Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
      if (!source) {
        if (isPasteTarget(event.target)) {
          event.preventDefault();
          setPasteNotice("Aucune image détectée dans le presse-papiers.");
          restoreFocus();
        }
        return;
      }
      event.preventDefault();
      uploadClipboardImage(source);
      restoreFocus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "v" || (!event.ctrlKey && !event.metaKey) || event.altKey || isTextTarget(event.target)) return;
      const requestedAt = Date.now();
      previousPasteFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pasteTargetRef.current?.focus({ preventScroll: true });
      window.setTimeout(() => {
        if (pasteEventSeenAt.current >= requestedAt || pasteUploadingRef.current) return;
        if (!navigator.clipboard?.read) {
          setPasteNotice("Le navigateur ne permet pas de lire l’image du presse-papiers.");
          restoreFocus();
          return;
        }
        void navigator.clipboard.read()
          .then(async (items) => {
            for (const item of items) {
              const type = item.types.find((value) => value.startsWith("image/"));
              if (type) { uploadClipboardImage(await item.getType(type)); return; }
            }
            setPasteNotice("Aucune image détectée dans le presse-papiers.");
          })
          .catch(() => setPasteNotice("Accès au presse-papiers refusé par le navigateur."))
          .finally(restoreFocus);
      }, 40);
    };
    window.addEventListener("paste", onPaste, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [canEdit, placeId]);

  if (detailsLoading)
    return (
      <div className="place-map-popup"><SkeletonList rows={3} label="Chargement du POI" /></div>
    );
  if (detailsError || !place)
    return (
      <div className="place-map-popup popup-error" role="alert">
        <strong>Impossible d’afficher ce POI</strong>
        <span>{detailsError}</span>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
    );

  const googleUrl = buildGoogleMapsUrl(place.latitude, place.longitude);
  const coordinates =
    place.latitude !== null && place.longitude !== null
      ? `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`
      : null;
  const fieldEnabled = (field: string) => place.field_config?.[field] !== false;
  const primaryCategory = place.categories.find((item) => item.is_primary);
  const isVisited = place.status.functional_state === "visited";
  const rating = isVisited ? place.visit_rating : place.interest_rating;
  const ratingLabel = isVisited
    ? "Évaluation après visite"
    : "Envie avant visite";
  const remove = async () => {
    if (
      !(await confirm({
        title: "Supprimer ce lieu ?",
        message: `« ${place.name} » sera placé dans la corbeille.`,
      }))
    )
      return;
    setDeleting(true);
    try {
      await deletePlace(place.id);
      onDeleted(place.id);
    } catch (error) {
      setDetailsError(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
      setDeleting(false);
    }
  };
  const toggleFavorite = async () => {
    try {
      setPlace(
        await updatePlace(place.id, {
          is_favorite: !(place.is_favorite === true),
        }),
      );
    } catch (error) {
      setDetailsError(
        error instanceof Error
          ? error.message
          : "Modification du favori impossible.",
      );
    }
  };
  const addToTrip = async (dayId?: string) => {
    if ((!tripAddTargetLabel && tripDays.length === 0) || addingToTrip) return;
    setAddingToTrip(true);
    try {
      if (dayId === undefined) await onAddToTrip(place);
      else await onAddToTrip(place, dayId);
    } finally {
      setAddingToTrip(false);
    }
  };
  const requestTripAdd = () => {
    if (tripAddTargetLabel) void addToTrip();
    else {
      setTargetDayId(tripDays[0]?.id ?? "");
      setTripDayPickerOpen(true);
    }
  };

  return (
    <article
      className="place-map-popup"
      aria-labelledby={`popup-title-${place.id}`}
    >
      {canEdit && <textarea ref={pasteTargetRef} className="popup-paste-target" data-popup-paste-target="true" tabIndex={-1} aria-label="Collage d’image depuis le presse-papiers" />}
      <section className="popup-hero">
        <PlacePopupGallery
          placeName={place.name}
          photos={photos}
          isLoading={photosLoading}
          error={photosError}
        />
        <div className="popup-overview">
          <div className="popup-heading">
            <h2
              id={`popup-title-${place.id}`}
              ref={titleRef}
              tabIndex={-1}
              title={place.name}
            >
              {place.name}
            </h2>
            <div className="popup-heading-actions">
              {canEdit && fieldEnabled("favorite") && (
                <button
                  className={`popup-favorite${place.is_favorite ? " active" : ""}`}
                  type="button"
                  aria-pressed={place.is_favorite === true}
                  aria-label={
                    place.is_favorite
                      ? "Retirer des favoris"
                      : "Ajouter aux favoris"
                  }
                  onClick={() => void toggleFavorite()}
                >
                  <Heart
                    size={17}
                    fill={place.is_favorite ? "currentColor" : "none"}
                  />
                </button>
              )}
              <button className={`popup-history-toggle${historyOpen ? " active" : ""}`} type="button" aria-label="Afficher l’historique" aria-pressed={historyOpen} title="Historique" onClick={() => setHistoryOpen((value) => !value)}><History size={17} /></button>
              <button
                className="popup-close"
                type="button"
                aria-label="Fermer la fiche"
                title="Fermer"
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </div>
          <div className="popup-overview-metadata">
            <section
              className="popup-overview-status-section"
              aria-label="Statut"
            >
              <span>Statut</span>
              <p>
                <i
                  className="status-dot"
                  style={{ backgroundColor: place.status.color }}
                  aria-hidden="true"
                />
                {place.status.name}
              </p>
            </section>
            <section
              className="popup-overview-category-section"
              aria-label="Catégorie"
            >
              <span>Catégorie</span>
              <p className="popup-primary-category">
                {primaryCategory ? (
                  <>
                    <CategoryIconPreview
                      iconId={primaryCategory.icon}
                      size={16}
                      showLabel={false}
                    />
                    {primaryCategory.name}
                  </>
                ) : (
                  "Non renseignée"
                )}
              </p>
            </section>
            <section className="popup-overview-tag-section" aria-label="Tags">
              <span>Tags</span>
              <ul className="popup-chips popup-overview-tags">
                {place.tags.length > 0 ? (
                  place.tags.slice(0, 2).map((item) => (
                    <li
                      className="tag"
                      key={item.id}
                      style={getTagColorStyle(item.color)}
                    >
                      {item.name}
                    </li>
                  ))
                ) : (
                  <li className="popup-empty-chip">Aucun tag</li>
                )}
                {place.tags.length > 2 && (
                  <li className="tag popup-tag-more">
                    +{place.tags.length - 2}
                  </li>
                )}
              </ul>
            </section>
          </div>
          {fieldEnabled("ratings") && (
            <section
              className="popup-overview-rating-section"
              aria-label="Note"
            >
              <span>Note</span>
              <p
                className="popup-rating"
                style={{ color: place.status.color }}
                aria-label={
                  rating !== null && rating !== undefined
                    ? `${ratingLabel} : ${rating} sur 5`
                    : `${ratingLabel} : aucune note`
                }
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const fillPercentage =
                    rating === null || rating === undefined
                      ? 0
                      : ratingFillPercentage(rating, star);
                  return (
                    <span
                      className="popup-rating-star"
                      data-fill={fillPercentage}
                      key={star}
                    >
                      <Star size={19} fill="none" />
                      <span
                        className="popup-rating-star-fill"
                        style={{ width: `${fillPercentage}%` }}
                      >
                        <Star size={19} fill="currentColor" />
                      </span>
                    </span>
                  );
                })}
                <strong>
                  {rating !== null && rating !== undefined
                    ? rating.toFixed(1)
                    : "Non noté"}
                </strong>
              </p>
            </section>
          )}
        </div>
      </section>
      {canEdit && !pasteNotice && <button className="popup-paste-hint" type="button" onClick={() => pasteTargetRef.current?.focus({ preventScroll: true })}>Collez une capture avec <kbd>Ctrl</kbd> + <kbd>V</kbd></button>}
      {pasteNotice && <p className={`popup-paste-notice${pasteUploading ? " is-loading" : ""}`} role="status" aria-live="polite">{pasteNotice}</p>}
      {detailsError && (
        <p className="inline-error" role="alert">
          {detailsError}
        </p>
      )}
      {historyOpen && <section className="popup-history" aria-label="Historique"><h3>Historique</h3>{historyLoading ? <p>Chargement…</p> : history.length === 0 ? <p>Aucun changement enregistré.</p> : <ol>{history.map((event) => <li key={event.id}><strong>{popupHistoryAction(event.action)}</strong><span>{event.actor_label} · {formatDate(event.created_at)}</span></li>)}</ol>}</section>}
      {fieldEnabled("description") && (
        <section className="popup-description">
          <h3>
            <FileText size={17} aria-hidden="true" />
            Description
          </h3>
          <p>{place.description || "\u00A0"}</p>
        </section>
      )}
      <div className="popup-summary">
        <article aria-label="Région administrative">
          <Earth aria-hidden="true" />
          <p>
            <b>Région</b>
            <span>{place.region || "Non déterminée"}</span>
          </p>
        </article>
        {coordinates && (
          <article aria-label="Coordonnées GPS">
            <MapPin aria-hidden="true" />
            <p>
              <b>Coordonnées</b>
              <span className="popup-summary-coordinate-row">
                <span>{coordinates}</span>
                <button
                  className="popup-summary-copy"
                  type="button"
                  aria-label="Copier les coordonnées GPS"
                  title="Copier les coordonnées"
                  onClick={() =>
                    void navigator.clipboard?.writeText(coordinates)
                  }
                >
                  <Copy size={13} aria-hidden="true" />
                </button>
              </span>
            </p>
          </article>
        )}
        <article aria-label="Durée de visite">
          <Clock3 aria-hidden="true" />
          <p>
            <b>Durée de visite</b>
            <span>{formatMinutes(place.default_visit_duration_minutes ?? 30)}</span>
          </p>
        </article>
        {fieldEnabled("danger_level") && (
          <article className="popup-summary-danger">
            <TriangleAlert aria-hidden="true" />
            <p>
              <b>Danger</b>
              <span>{place.danger_level || "Non renseigné"}</span>
            </p>
          </article>
        )}
        <article>
          <CalendarDays aria-hidden="true" />
          <p>
            <b>Ajouté le</b>
            <span>{formatDate(place.created_at)}</span>
          </p>
        </article>
        <article>
          <History aria-hidden="true" />
          <p>
            <b>Modifié le</b>
            <span>{formatDate(place.updated_at)}</span>
          </p>
        </article>
      </div>
      <PlacePopupActions
        googleMapsUrl={googleUrl}
        isDeleting={deleting}
        canEdit={canEdit}
        showManagementActions={showManagementActions}
        showClose={false}
        tripAddTargetLabel={tripAddTargetLabel}
        canChooseTripDay={tripDays.length > 0}
        isAddingToTrip={addingToTrip}
        onAddToTrip={requestTripAdd}
        onEdit={onEdit}
        onDelete={() => void remove()}
        onClose={onClose}
      />
      {tripDayPickerOpen && (
        <section
          className="popup-trip-day-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Choisir une journée de sortie"
        >
          <h3>Ajouter {place.name} à une journée</h3>
          <label>
            Journée
            <select
              value={targetDayId}
              onChange={(event) => setTargetDayId(event.target.value)}
            >
              {tripDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button type="button" onClick={() => setTripDayPickerOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!targetDayId || addingToTrip}
              onClick={() => {
                setTripDayPickerOpen(false);
                void addToTrip(targetDayId);
              }}
            >
              Ajouter
            </button>
          </div>
        </section>
      )}
      {confirmationDialog}
    </article>
  );
}

const popupHistoryAction = (action: string) => ({ created: 'Lieu créé', updated: 'Lieu modifié', trashed: 'Déplacé dans la corbeille', restored: 'Lieu restauré', photo_added: 'Photo ajoutée', photo_removed: 'Photo supprimée' }[action] ?? action.replaceAll('_', ' '));
