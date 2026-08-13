import { ArrowDownAZ, ArrowUpDown, CalendarPlus, Check, CircleCheck, CheckSquare, ChevronDown, Import, Heart, History, Folder, Grid2X2, LayoutList, List, Minus, Pencil, Plus, Search, RotateCcw, SlidersHorizontal, Tag, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { GoogleMapsIcon } from "../common/GoogleMapsIcon";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { bulkAddPlacesToTrip, bulkUpdatePlaces, deletePlace, getPlaceFacets, getPlaceListPosition, getPlaces, restorePlace, updatePlace } from "../../api/places";
import { publishGlobalFeedback } from "../common/globalFeedback";
import { getCategories } from "../../api/categories";
import { getTags } from "../../api/tags";
import { getTrip, listTrips, restoreTripState } from "../../api/trips";
import { DEFAULT_PLACE_FILTERS, countActivePlaceFilters, hasActivePlaceFilters, normalizePlaceFilters, resetPlaceFilters } from "../../places/placeFilters";
import type { PoiMap } from "../../types/map";
import type { PlaceDetails, PlaceFacets, PlaceFilters, PreviewPlace } from "../../types/place";
import type { PlaceStatusSummary } from "../../types/status";
import type { Trip } from "../../types/trip";
import { CategoryIconPreview } from "../icons/CategoryIconPreview";
import { withMap } from "../../utils/map";
import { recordReversibleAction } from "../../ui/actionHistory";
import { MapMarkerFilterContext } from "../map/mapMarkerFilterContext";
import { KmzImportDialog } from "../imports/KmzImportDialog";
import { useConfirmDialog } from "../common/useConfirmDialog";
import { useI18n } from "../../i18n/useI18n";
import { CountryFlag } from "../maps/CountryFlag";
import { getTagColorStyle } from "../../tags/tagColors";
import { VirtualPlaceRows } from "./VirtualPlaceRows";
import { PlaceListThumbnail } from "./PlaceListThumbnail";
import { PlaceGallery } from "./PlaceGallery";
import { SkeletonList } from "../common/Skeleton";
import { EmptyState } from "../common/EmptyState";
import { PanelLayoutLockButton } from "../layout/PanelLayoutLockButton";

const PAGE_SIZE = 50;
const PLACE_LIST_REQUEST_TIMEOUT_MS = 20_000;
const emptyFacets: PlaceFacets = {
  total: 0,
  non_visited: 0,
  visited: 0,
  favorites: 0,
  categories: [],
  tags: [],
  statuses: [],
  regions: [],
  danger_levels: [],
  condition_values: [],
  with_photos: 0,
  without_photos: 0,
  with_coordinates: 0,
  without_coordinates: 0,
  in_trip: 0,
  not_in_trip: 0,
};

interface Props {
  poiMap: PoiMap | null;
  statuses?: PlaceStatusSummary[];
  filters?: PlaceFilters;
  selectedPlaceId: string | null;
  refreshVersion: number;
  removedPlaceId: string | null;
  onFiltersChange?: (filters: PlaceFilters) => void;
  onPlaceSelect: (place: PreviewPlace) => void;
  onClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onImported?: () => void;
  tripPlanningActive?: boolean;
  tripPlaceIds?: Set<string>;
  tripAddTargetLabel?: string | null;
  activeTripId?: string | null;
  activeTripDayId?: string | null;
  onTripPlaceAdd?: (place: PreviewPlace) => void;
  onBulkChanged?: () => void;
  onBulkTripChanged?: (tripId: string) => void;
  importRequest?: number;
  selectionMode?: boolean;
  selectedPlaceIds?: ReadonlySet<string>;
  onSelectionModeChange?: (active: boolean) => void;
  onSelectedPlaceIdsChange?: (ids: Set<string>) => void;
}

const sortPlaces = (places: PlaceDetails[]) => places;
const toggle = (values: string[], value: string) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
const formatLocation = (place: PlaceDetails) => place.region || (place.latitude !== null && place.longitude !== null ? `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}` : "Coordonnées non renseignées");
const getRelevantRating = (place: PlaceDetails) => {
  if (place.visit_rating != null && place.interest_rating != null) return place.visit_rating;
  return place.status.functional_state === "visited" ? (place.visit_rating ?? place.interest_rating) : (place.interest_rating ?? place.visit_rating);
};

const formatRating = (place: PlaceDetails) => {
  const rating = getRelevantRating(place);
  return rating == null ? null : rating.toFixed(1);
};

const formatMapLabel = (map: PoiMap, locale: string) => {
  if (map.name !== map.country?.name || !map.country?.iso_alpha2) return map.name;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(map.country.iso_alpha2) ?? map.name;
  } catch {
    return map.name;
  }
};

export function MapPlaceList({ poiMap, statuses = [], filters = DEFAULT_PLACE_FILTERS, selectedPlaceId, refreshVersion, removedPlaceId, onFiltersChange = () => undefined, onPlaceSelect, collapsed = false, onCollapsedChange = () => undefined, onImported = () => undefined, tripPlanningActive = false, tripPlaceIds = new Set(), tripAddTargetLabel = null, activeTripId = null, activeTripDayId = null, onTripPlaceAdd = () => undefined, onBulkChanged = () => undefined, onBulkTripChanged = () => undefined, importRequest = 0, selectionMode: controlledSelectionMode, selectedPlaceIds: controlledSelectedIds, onSelectionModeChange, onSelectedPlaceIdsChange }: Props) {
  const { t, formatDate, locale } = useI18n();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [places, setPlaces] = useState<PlaceDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [listRequestVersion, setListRequestVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [facets, setFacets] = useState<PlaceFacets>(emptyFacets);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; icon?: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [internalSelectionMode, setInternalSelectionMode] = useState(false);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkStatusId, setBulkStatusId] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkTagMenuOpen, setBulkTagMenuOpen] = useState(false);
  const [bulkTagQuery, setBulkTagQuery] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState("");
  const [dayId, setDayId] = useState("");
  const [importing, setImporting] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches);
  const [displayMode, setDisplayMode] = useState<"compact" | "expanded" | "gallery">("expanded");
  const mobileSwipeStart = useRef<{
    placeId: string;
    pointerId: number;
    x: number;
  } | null>(null);
  const mobileSwipeMoved = useRef(false);
  const mobileSwipeOffset = useRef(0);
  const mobilePanelSwipeStart = useRef<{ pointerId: number; y: number } | null>(null);
  const [mobilePlaceSwipe, setMobilePlaceSwipe] = useState<{
    placeId: string;
    offset: number;
  } | null>(null);
  const [mobilePlaceSwipeOpen, setMobilePlaceSwipeOpen] = useState<{
    placeId: string;
    direction: "delete" | "more";
  } | null>(null);
  const [queryInput, setQueryInput] = useState(filters.query);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const listBodyRef = useRef<HTMLDivElement>(null);
  const placesRef = useRef<PlaceDetails[]>([]);
  const listRequest = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const loadMoreRequest = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  const selectionRequest = useRef(0);
  const selectionController = useRef<AbortController | null>(null);
  const { setFilter: setMarkerFilter } = useContext(MapMarkerFilterContext);
  const canImportKmz = poiMap?.can_import !== false && !tripPlanningActive && !isMobileViewport;
  const selectionMode = controlledSelectionMode ?? internalSelectionMode;
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const replaceSelectedIds = useCallback(
    (next: Set<string>) => {
      setInternalSelectedIds(next);
      onSelectedPlaceIdsChange?.(next);
    },
    [onSelectedPlaceIdsChange],
  );
  const replaceSelectionMode = (active: boolean) => {
    setInternalSelectionMode(active);
    onSelectionModeChange?.(active);
  };
  const update = useCallback((partial: Partial<PlaceFilters>) => onFiltersChange(normalizePlaceFilters({ ...filters, ...partial })), [filters, onFiltersChange]);

  useEffect(() => {
    setMarkerFilter({
      query: filters.query,
      categoryId: filters.categoryIds[0] ?? "",
      statusId: filters.statusIds[0] ?? null,
      tagId: filters.tagIds[0] ?? "",
    });
  }, [filters, setMarkerFilter]);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    if (tripPlanningActive || isMobileViewport) setImporting(false);
  }, [isMobileViewport, tripPlanningActive]);
  // Selection stays anchored to the shared active day in Trip mode.  The
  // existing selectors remain available for a deliberate alternate target.
  useEffect(() => {
    if (!tripPlanningActive || !activeTripId || !activeTripDayId) return;
    setTripId(activeTripId);
    setDayId(activeTripDayId);
  }, [activeTripDayId, activeTripId, tripPlanningActive]);
  useEffect(() => {
    if (importRequest > 0 && poiMap?.can_import !== false && !tripPlanningActive && !isMobileViewport) setImporting(true);
  }, [importRequest, isMobileViewport, poiMap, tripPlanningActive]);
  useEffect(() => {
    selectionController.current?.abort();
    replaceSelectedIds(new Set());
    setPlaces([]);
    setFacets(emptyFacets);
    setNextOffset(0);
    setListReady(false);
    setBulkNotice(null);
  }, [poiMap?.id, replaceSelectedIds]);
  useEffect(() => {
    const mapId = poiMap?.id;
    listController.current?.abort();
    loadMoreController.current?.abort();
    loadMoreRequest.current += 1;
    setLoadingMore(false);
    if (!mapId) {
      listController.current = null;
      setLoading(false);
      setListReady(false);
      return;
    }

    const requestId = ++listRequest.current;
    const listAbortController = new AbortController();
    const auxiliaryController = new AbortController();
    listController.current = listAbortController;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      listAbortController.abort();
    }, PLACE_LIST_REQUEST_TIMEOUT_MS);
    setLoading(true);
    setError(null);

    void getPlaces({ mapId, filters, limit: PAGE_SIZE, offset: 0 }, listAbortController.signal)
      .then((page) => {
        if (listAbortController.signal.aborted || requestId !== listRequest.current) return;
        setPlaces(page);
        setNextOffset(page.length);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((caught: unknown) => {
        if (requestId !== listRequest.current) return;
        if (timedOut) {
          setError("Le chargement des lieux a expiré. Vous pouvez le relancer.");
        } else if (!listAbortController.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Chargement impossible.");
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (requestId !== listRequest.current) return;
        if (listController.current === listAbortController) listController.current = null;
        setListReady(true);
        setLoading(false);
      });

    // Les facettes et les catalogues enrichissent le panneau, mais ne doivent
    // jamais empêcher l'affichage de la liste lorsque l'un de ces appels est lent.
    void Promise.allSettled([getPlaceFacets(mapId, filters, auxiliaryController.signal), getCategories(auxiliaryController.signal, undefined, mapId), getTags(auxiliaryController.signal, undefined, mapId)]).then(([facetsResult, categoriesResult, tagsResult]) => {
      if (auxiliaryController.signal.aborted || requestId !== listRequest.current) return;
      if (facetsResult.status === "fulfilled") setFacets(facetsResult.value);
      if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value);
      if (tagsResult.status === "fulfilled") setTags(tagsResult.value);
    });

    return () => {
      window.clearTimeout(timeoutId);
      if (requestId === listRequest.current) listRequest.current += 1;
      loadMoreRequest.current += 1;
      listAbortController.abort();
      loadMoreController.current?.abort();
      auxiliaryController.abort();
      if (listController.current === listAbortController) listController.current = null;
      loadMoreController.current = null;
    };
  }, [filters, listRequestVersion, poiMap?.id, refreshVersion]);
  useEffect(() => {
    if (!poiMap?.can_edit || !selectionMode) return;
    const controller = new AbortController();
    void listTrips(poiMap.id, controller.signal)
      .then(setTrips)
      .catch(() => setTrips([]));
    return () => controller.abort();
  }, [poiMap?.can_edit, poiMap?.id, selectionMode]);
  useEffect(() => {
    if (!tripId) {
      setDayId("");
      return;
    }
    const controller = new AbortController();
    void getTrip(tripId, controller.signal)
      .then((trip) => setTrips((current) => current.map((item) => (item.id === trip.id ? trip : item))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [tripId]);

  const visible = useMemo(() => sortPlaces(places.filter((place) => place.id !== removedPlaceId)), [places, removedPlaceId]);
  const selectedTrip = trips.find((trip) => trip.id === tripId);
  const hiddenSelected = [...selectedIds].filter((id) => !visible.some((place) => place.id === id)).length;
  const activeCount = countActivePlaceFilters(filters);
  useEffect(() => {
    setQueryInput(filters.query);
  }, [filters.query]);
  useEffect(() => {
    if (queryInput === filters.query) return;
    const timeout = window.setTimeout(() => update({ query: queryInput }), 300);
    return () => window.clearTimeout(timeout);
  }, [filters.query, queryInput, update]);
  const selectedPlaceIndex = selectedPlaceId === null ? -1 : visible.findIndex((place) => place.id === selectedPlaceId);
  const placeRowsVersion = [displayMode, selectedPlaceId ?? "", selectionMode ? "selection" : "", [...selectedIds].sort().join(","), [...tripPlaceIds].sort().join(","), tripPlanningActive ? "planning" : "", tripAddTargetLabel ?? "", poiMap?.can_edit === false ? "readonly" : "editable", mobilePlaceSwipe ? `${mobilePlaceSwipe.placeId}:${mobilePlaceSwipe.offset}` : "", mobilePlaceSwipeOpen ? `${mobilePlaceSwipeOpen.placeId}:${mobilePlaceSwipeOpen.direction}` : ""].join("|");
  useEffect(() => {
    if (!listReady || !selectedPlaceId || !poiMap || placesRef.current.some((place) => place.id === selectedPlaceId)) return;
    selectionController.current?.abort();
    const controller = new AbortController();
    selectionController.current = controller;
    const requestId = ++selectionRequest.current;
    setError(null);
    void getPlaceListPosition(selectedPlaceId, poiMap.id, filters, controller.signal)
      .then(async (position) => {
        if (controller.signal.aborted || requestId !== selectionRequest.current) return;
        if (!position.matches_filters || position.page === null) {
          setError("Ce lieu est masqué par les filtres actuels.");
          return;
        }
        const page = await getPlaces(
          {
            mapId: poiMap.id,
            filters,
            limit: PAGE_SIZE,
            offset: position.page * PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted || requestId !== selectionRequest.current) return;
        setPlaces((current) => sortPlaces([...new Map([...current, ...page].map((place) => [place.id, place])).values()]));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted && requestId === selectionRequest.current) setError(caught instanceof Error ? caught.message : "Impossible de localiser ce lieu dans la liste.");
      });
    return () => controller.abort();
  }, [filters, listReady, poiMap, selectedPlaceId]);
  const loadMore = useCallback(async () => {
    if (!poiMap || loading || loadingMore || !hasMore) return;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    const requestId = ++loadMoreRequest.current;
    loadMoreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getPlaces({ mapId: poiMap.id, filters, limit: PAGE_SIZE, offset: nextOffset }, controller.signal);
      if (controller.signal.aborted || requestId !== loadMoreRequest.current) return;
      setPlaces((current) => sortPlaces([...new Map([...current, ...page].map((place) => [place.id, place])).values()]));
      setNextOffset(nextOffset + page.length);
      setHasMore(page.length === PAGE_SIZE);
    } catch (caught) {
      if (!controller.signal.aborted && requestId === loadMoreRequest.current) setError(caught instanceof Error ? caught.message : "Impossible de charger davantage de lieux.");
    } finally {
      if (requestId === loadMoreRequest.current) {
        if (loadMoreController.current === controller) loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  }, [filters, hasMore, loading, loadingMore, nextOffset, poiMap]);
  useEffect(() => {
    const sentinel = loadMoreSentinel.current;
    if (!sentinel || !hasMore || collapsed || typeof IntersectionObserver === "undefined") return;
    const root = sentinel.closest<HTMLElement>(".place-list-body");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "0px 0px 240px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [collapsed, hasMore, loadMore]);
  const toggleSelected = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    replaceSelectedIds(next);
  };
  const toggleFavorite = async (place: PlaceDetails) => {
    try {
      await updatePlace(place.id, { is_favorite: !place.is_favorite });
      onBulkChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de modifier le favori.");
    }
  };
  const removePlace = async (place: PlaceDetails) => {
    if (
      !(await confirm({
        title: "Supprimer ce lieu ?",
        message: `« ${place.name} » sera placé dans la corbeille.`,
      }))
    )
      return;
    try {
      await deletePlace(place.id);
      publishGlobalFeedback("success", `POI « ${place.name} » déplacé dans la corbeille.`);
      onBulkChanged();
      recordReversibleAction({
        label: `suppression du POI « ${place.name} »`,
        undo: async () => {
          await restorePlace(place.id);
          onBulkChanged();
        },
        redo: async () => {
          await deletePlace(place.id);
          onBulkChanged();
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    }
  };
  const beginMobilePlaceSwipe = (event: ReactPointerEvent<HTMLElement>, placeId: string) => {
    if (!window.matchMedia("(max-width: 760px)").matches || (event.target as HTMLElement).closest("a, input, select, .places-place-actions, .places-mobile-swipe-action")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    mobileSwipeMoved.current = false;
    mobileSwipeStart.current = {
      placeId,
      pointerId: event.pointerId,
      x: event.clientX,
    };
    const opened = mobilePlaceSwipeOpen?.placeId === placeId ? (mobilePlaceSwipeOpen.direction === "delete" ? 92 : -116) : 0;
    mobileSwipeOffset.current = opened;
    setMobilePlaceSwipe({ placeId, offset: opened });
    if (mobilePlaceSwipeOpen?.placeId !== placeId) setMobilePlaceSwipeOpen(null);
  };
  const moveMobilePlaceSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const swipe = mobileSwipeStart.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const opened = mobilePlaceSwipeOpen?.placeId === swipe.placeId ? (mobilePlaceSwipeOpen.direction === "delete" ? 92 : -116) : 0;
    const offset = Math.max(-124, Math.min(100, event.clientX - swipe.x + opened));
    if (Math.abs(offset) > 7) {
      mobileSwipeMoved.current = true;
      event.preventDefault();
    }
    mobileSwipeOffset.current = offset;
    setMobilePlaceSwipe({ placeId: swipe.placeId, offset });
  };
  const finishMobilePlaceSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const swipe = mobileSwipeStart.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const offset = mobileSwipeOffset.current;
    mobileSwipeStart.current = null;
    mobileSwipeOffset.current = 0;
    setMobilePlaceSwipe(null);
    setMobilePlaceSwipeOpen(Math.abs(offset) >= 44 ? { placeId: swipe.placeId, direction: offset > 0 ? "delete" : "more" } : null);
  };
  const beginMobilePanelSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isMobileViewport || (event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    mobilePanelSwipeStart.current = {
      pointerId: event.pointerId,
      y: event.clientY,
    };
  };
  const finishMobilePanelSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = mobilePanelSwipeStart.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    mobilePanelSwipeStart.current = null;
    const deltaY = event.clientY - gesture.y;
    if (deltaY <= -42 && collapsed) onCollapsedChange(false);
    else if (deltaY >= 42 && !collapsed) onCollapsedChange(true);
  };
  const togglePage = () => {
    const ids = visible.map((place) => place.id);
    const next = new Set(selectedIds);
    const every = ids.length > 0 && ids.every((id) => next.has(id));
    ids.forEach((id) => (every ? next.delete(id) : next.add(id)));
    replaceSelectedIds(next);
  };
  const runBulk = async (action: "set_status" | "set_category" | "add_category" | "remove_category" | "add_tag" | "remove_tag" | "delete") => {
    if (!poiMap || selectedIds.size === 0) return;
    if (
      action === "delete" &&
      !(await confirm({
        title: `Supprimer ${selectedIds.size} lieu${selectedIds.size > 1 ? "x" : ""} ?`,
        message: "Les lieux sélectionnés seront placés dans la corbeille. Vous pourrez annuler cette action.",
        confirmLabel: "Tout supprimer",
      }))
    )
      return;
    try {
      setBulkBusy(true);
      setBulkError(null);
      setBulkNotice(null);
      const affectedPlaceIds = [...selectedIds];
      const result = await bulkUpdatePlaces({
        place_ids: affectedPlaceIds,
        action,
        ...(action === "set_status" ? { status_id: bulkStatusId } : {}),
        ...(action.includes("category") ? { category_id: bulkCategoryId } : {}),
        ...(action.includes("tag") ? { tag_ids: bulkTagIds } : {}),
      });
      setBulkNotice(`${result.updated_count || result.deleted_count} lieux mis à jour${result.unchanged_count ? `, ${result.unchanged_count} inchangés` : ""}.`);
      if (action === "delete") {
        replaceSelectedIds(new Set());
        recordReversibleAction({
          label: `suppression de ${affectedPlaceIds.length} POI`,
          undo: async () => {
            await Promise.all(affectedPlaceIds.map((id) => restorePlace(id)));
            onBulkChanged();
          },
          redo: async () => {
            await bulkUpdatePlaces({
              place_ids: affectedPlaceIds,
              action: "delete",
            });
            onBulkChanged();
          },
        });
      }
      onBulkChanged();
      if (action.includes("tag")) {
        setBulkTagIds([]);
        setBulkTagMenuOpen(false);
        setBulkTagQuery("");
      }
    } catch (caught) {
      setBulkError(caught instanceof Error ? caught.message : "Action groupée impossible.");
    } finally {
      setBulkBusy(false);
    }
  };
  const addToTrip = async () => {
    if (!tripId || !dayId || selectedIds.size === 0) return;
    try {
      setBulkBusy(true);
      setBulkError(null);
      const tripBefore = await getTrip(tripId);
      const result = await bulkAddPlacesToTrip({
        place_ids: [...selectedIds],
        trip_id: tripId,
        day_id: dayId,
      });
      setBulkNotice(`${result.added_count} POI ajoutés à la journée${result.duplicate_count ? `, ${result.duplicate_count} déjà présents` : ""}.`);
      onBulkChanged();
      onBulkTripChanged(tripId);
      if (result.added_count > 0) {
        const tripAfter = await getTrip(tripId);
        const restore = async (state: Trip) => {
          await restoreTripState(tripId, state);
          onBulkTripChanged(tripId);
        };
        recordReversibleAction({
          label: `ajout de ${result.added_count} POI à la sortie`,
          undo: () => restore(tripBefore),
          redo: () => restore(tripAfter),
        });
      }
    } catch (caught) {
      setBulkError(caught instanceof Error ? caught.message : "Impossible d'ajouter à la sortie.");
    } finally {
      setBulkBusy(false);
    }
  };
  const boolControl = (label: string, value: boolean | null, apply: (next: boolean | null) => void) => (
    <>
      <label>
        {label}
        <select value={value === null ? "" : String(value)} onChange={(event) => apply(event.target.value === "" ? null : event.target.value === "true")}>
          <option value="">Tous</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
      </label>
      {label === "Présent dans une sortie" && (
        <>
          <label>
            Favoris
            <select
              value={filters.isFavorite === null ? "" : String(filters.isFavorite)}
              onChange={(event) =>
                update({
                  isFavorite: event.target.value === "" ? null : event.target.value === "true",
                })
              }
            >
              <option value="">Tous</option>
              <option value="true">Favoris</option>
              <option value="false">Non favoris</option>
            </select>
          </label>
          <label>
            Visites
            <select
              value={filters.functionalState ?? ""}
              onChange={(event) =>
                update({
                  functionalState: event.target.value === "visited" || event.target.value === "non_visited" ? event.target.value : null,
                })
              }
            >
              <option value="">Tous</option>
              <option value="visited">Visités</option>
              <option value="non_visited">Non visités</option>
            </select>
          </label>
          <label>
            Note minimale
            <select
              value={filters.ratingMin ?? ""}
              onChange={(event) =>
                update({
                  ratingMin: event.target.value ? Number(event.target.value) : null,
                })
              }
            >
              <option value="">Toutes</option>
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} / 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Trier par
            <select value={filters.sortBy} onChange={(event) => update({ sortBy: event.target.value as PlaceFilters["sortBy"] })}>
              <option value="name">Nom</option>
              <option value="created_at">Date de création</option>
              <option value="updated_at">Dernière modification</option>
              <option value="interest_rating">Intérêt</option>
              <option value="visit_rating">Visite</option>
              <option value="relevant_rating">Note pertinente</option>
              <option value="favorite">Favoris</option>
            </select>
          </label>
          <label>
            Ordre
            <select
              value={filters.sortDirection}
              onChange={(event) =>
                update({
                  sortDirection: event.target.value as PlaceFilters["sortDirection"],
                })
              }
            >
              <option value="asc">Croissant</option>
              <option value="desc">Décroissant</option>
            </select>
          </label>
        </>
      )}
    </>
  );
  const multiOptions = (
    label: string,
    values: Array<{
      id: string;
      name: string;
      count?: number;
      icon?: string;
      color?: string;
    }>,
    selected: string[],
    apply: (next: string[]) => void,
  ) => (
    <details className="place-filter-group">
      <summary>
        {label}
        {selected.length ? ` (${selected.length})` : ""}
      </summary>
      <div>
        {values.map((value) => (
          <label key={value.id} className="place-filter-option">
            <input type="checkbox" checked={selected.includes(value.id)} onChange={() => apply(toggle(selected, value.id))} />
            {value.color && <i style={{ backgroundColor: value.color }} />}
            {value.icon && <CategoryIconPreview iconId={value.icon} size={15} showLabel={false} />}
            {value.name}
            <small>{value.count ?? 0}</small>
          </label>
        ))}
      </div>
    </details>
  );

  return (
    <aside className={`country-place-panel cv-workspace-panel places-redesign-panel${collapsed ? " is-collapsed" : ""}${tripPlanningActive ? " is-trip-planning" : ""}`} id="map-place-list" tabIndex={-1} aria-labelledby="map-place-list-title">
      <header
        className="places-redesign-header"
        onPointerDown={beginMobilePanelSwipe}
        onPointerUp={finishMobilePanelSwipe}
        onPointerCancel={() => {
          mobilePanelSwipeStart.current = null;
        }}
      >
        <div>
          <div className="places-redesign-title-row">
            <h2 id="map-place-list-title">{t("places.title")}</h2>
            {poiMap && (
              <span className="places-redesign-count">
                {t("places.count", {
                  count: facets.with_coordinates + facets.without_coordinates || visible.length,
                })}
              </span>
            )}
          </div>
          {!collapsed && poiMap && (
            <p className="places-redesign-map-meta">
              <span className="places-redesign-map-identity">
                <CountryFlag countryCode={poiMap.country?.iso_alpha2 ?? ""} className="places-redesign-map-flag" fallbackSize={15} />
                <span>{formatMapLabel(poiMap, locale)}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {poiMap.updated_at
                  ? t("places.updatedAt", {
                      date: formatDate(poiMap.updated_at, {
                        day: "numeric",
                        month: "short",
                      }),
                    })
                  : t("places.updatedRecently")}
              </span>
            </p>
          )}
        </div>
        <div className="places-redesign-header-actions">
          {collapsed && (
            <button className="places-mobile-expand-toggle" type="button" aria-label={t("places.openPanel")} onClick={() => onCollapsedChange(false)}>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          )}
          {!collapsed && poiMap && canImportKmz && (
            <button className="panel-icon-button places-import-kmz" type="button" aria-label={t("places.import")} onClick={() => setImporting(true)}>
              <Import size={17} />
            </button>
          )}
          {!collapsed && poiMap && !tripPlanningActive && (
            <button className={`panel-icon-button places-mobile-controls-toggle${mobileControlsOpen ? " active" : ""}`} type="button" aria-label={mobileControlsOpen ? t("places.hideControls") : t("places.showControls")} title={mobileControlsOpen ? t("places.hideControls") : t("places.showControls")} aria-expanded={mobileControlsOpen} onClick={() => setMobileControlsOpen((open) => !open)}>
              <SlidersHorizontal size={17} aria-hidden="true" />
            </button>
          )}
          {!collapsed && poiMap && !tripPlanningActive && (
            <button className="panel-icon-button places-mobile-view-toggle" type="button" aria-label={displayMode === "gallery" ? t("places.listView") : t("places.galleryView")} title={displayMode === "gallery" ? t("places.listView") : t("places.galleryView")} onClick={() => setDisplayMode((mode) => (mode === "gallery" ? "expanded" : "gallery"))}>
              {displayMode === "gallery" ? <LayoutList size={17} aria-hidden="true" /> : <Grid2X2 size={17} aria-hidden="true" />}
            </button>
          )}
          {!collapsed && poiMap && !tripPlanningActive && poiMap.can_edit !== false && (
            <Link className="places-redesign-create panel-create-action" to={withMap("/places/new", poiMap.id)} aria-label={t("places.new")} title={t("places.new")}>
              <Plus size={18} aria-hidden="true" />
              <span className="panel-create-action__label">{t("places.new")}</span>
            </Link>
          )}
          <PanelLayoutLockButton />
          <button className="panel-icon-button places-collapse-toggle" type="button" aria-label={collapsed ? t("places.expandPanel") : t("places.closePanel")} aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)}>
            {collapsed ? <Plus size={18} aria-hidden="true" /> : <Minus size={18} aria-hidden="true" />}
          </button>
        </div>
      </header>
      {poiMap && (
        <section className={`places-redesign-controls${mobileControlsOpen ? " is-mobile-open" : ""}`} aria-label={t("places.controls")}>
          <label className="place-list-search places-redesign-search">
            <Search aria-hidden="true" size={19} />
            <span className="visually-hidden">{t("places.search")}</span>
            <input type="search" value={queryInput} placeholder={t("places.search")} onChange={(event) => setQueryInput(event.target.value)} />
            {queryInput && (
              <button
                type="button"
                aria-label={t("places.clearSearch")}
                onClick={() => {
                  setQueryInput("");
                  update({ query: "" });
                }}
              >
                <X size={15} />
              </button>
            )}
          </label>
          <nav className="places-quick-filters" aria-label={t("places.quickFilters")}>
            <button type="button" className={filters.functionalState === null && filters.isFavorite !== true ? "active" : ""} onClick={() => update({ functionalState: null, isFavorite: null })}>
              {t("places.all")}
              <small>{facets.total}</small>
            </button>
            <button
              type="button"
              className={filters.functionalState === "non_visited" ? "active" : ""}
              onClick={() =>
                update({
                  functionalState: filters.functionalState === "non_visited" ? null : "non_visited",
                })
              }
            >
              {t("places.notVisited")}
              <small>{facets.non_visited}</small>
            </button>
            <button
              type="button"
              className={filters.functionalState === "visited" ? "active" : ""}
              onClick={() =>
                update({
                  functionalState: filters.functionalState === "visited" ? null : "visited",
                })
              }
            >
              {t("places.visited")}
              <small>{facets.visited}</small>
            </button>
            <button
              type="button"
              className={filters.isFavorite === true ? "active" : ""}
              onClick={() =>
                update({
                  isFavorite: filters.isFavorite === true ? null : true,
                })
              }
            >
              {t("places.favorites")}
              <small>{facets.favorites}</small>
            </button>
          </nav>
          <div className="places-redesign-toolbar">
            <div className="places-view-switcher" role="group" aria-label={t("places.displayMode")}>
              <button type="button" className={displayMode === "compact" ? "active" : ""} aria-pressed={displayMode === "compact"} aria-label={t("places.compactView")} onClick={() => setDisplayMode("compact")}>
                <List size={18} />
              </button>
              <button type="button" className={displayMode === "expanded" ? "active" : ""} aria-pressed={displayMode === "expanded"} aria-label={t("places.expandedView")} onClick={() => setDisplayMode("expanded")}>
                <LayoutList size={18} />
              </button>
              <button type="button" className={displayMode === "gallery" ? "active" : ""} aria-pressed={displayMode === "gallery"} aria-label="Affichage en galerie" title="Affichage en galerie" onClick={() => setDisplayMode("gallery")}>
                <Grid2X2 size={18} />
              </button>
            </div>
            {poiMap && (
              <button
                className={`panel-icon-button places-selection-toggle${selectionMode ? " primary" : ""}`}
                type="button"
                aria-label={t("places.selection")}
                aria-pressed={selectionMode}
                onClick={() => {
                  replaceSelectionMode(!selectionMode);
                  replaceSelectedIds(new Set());
                }}
              >
                <CheckSquare size={17} />
              </button>
            )}
            <label className="places-sort-control">
              <ArrowDownAZ size={17} />
              <span className="visually-hidden">{t("places.sortName")}</span>
              <select
                value={filters.sortBy}
                onChange={(event) =>
                  update({
                    sortBy: event.target.value as PlaceFilters["sortBy"],
                  })
                }
              >
                <option value="name">{t("places.sortName")}</option>
                <option value="created_at">Trier par : Ajout</option>
                <option value="updated_at">Trier par : Modification</option>
                <option value="interest_rating">Trier par : Note</option>
                <option value="favorite">Trier par : Favoris</option>
                <option value="status">Trier par : Statut</option>
                <option value="country">Trier par : Pays</option>
                <option value="city">Trier par : Ville</option>
              </select>
            </label>
            <button
              className="panel-icon-button"
              type="button"
              aria-label="Inverser l’ordre de tri"
              title="Inverser l’ordre"
              onClick={() =>
                update({
                  sortDirection: filters.sortDirection === "asc" ? "desc" : "asc",
                })
              }
            >
              <ArrowUpDown size={17} />
            </button>
            <button className={`places-advanced-filter${filtersOpen ? " active" : ""}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
              <SlidersHorizontal size={17} />
              {t("places.filters")}
              {activeCount ? ` (${activeCount})` : ""}
            </button>
          </div>
          {filtersOpen && (
            <div className="place-filter-drawer" role="region" aria-label="Filtres avancés">
              {multiOptions(
                "Catégories",
                categories.map((item) => ({
                  ...item,
                  count: facets.categories.find((facet) => facet.id === item.id)?.count ?? 0,
                })),
                filters.categoryIds,
                (categoryIds) => update({ categoryIds }),
              )}
              {multiOptions(
                "Tags",
                tags.map((item) => ({
                  ...item,
                  count: facets.tags.find((facet) => facet.id === item.id)?.count ?? 0,
                })),
                filters.tagIds,
                (tagIds) => update({ tagIds }),
              )}
              {multiOptions(
                "Statuts",
                statuses.map((item) => ({
                  id: item.id,
                  name: item.name,
                  color: item.color,
                  count: facets.statuses.find((facet) => facet.id === item.id)?.count ?? 0,
                })),
                filters.statusIds,
                (statusIds) => update({ statusIds }),
              )}
              {multiOptions(
                "Régions",
                facets.regions.map((item) => ({
                  id: item.value ?? "",
                  name: item.value ?? "",
                  count: item.count,
                })),
                filters.regions,
                (regions) => update({ regions }),
              )}
              <details className="place-filter-group">
                <summary>Photos, coordonnées et sortie</summary>
                <div>
                  {boolControl("Photos", filters.hasPhotos, (hasPhotos) => update({ hasPhotos }))}
                  {boolControl("Coordonnées valides", filters.hasValidCoordinates, (hasValidCoordinates) => update({ hasValidCoordinates }))}
                  {boolControl("Présent dans une sortie", filters.inTrip, (inTrip) => update({ inTrip }))}
                </div>
              </details>
              <button className="place-filter-reset-button" type="button" onClick={() => onFiltersChange(resetPlaceFilters(filters))} disabled={!hasActivePlaceFilters(filters)}>
                <RotateCcw aria-hidden="true" size={15} />
                Réinitialiser tous les filtres
              </button>
            </div>
          )}
        </section>
      )}
      {selectionMode && (
        <section className="places-selection-bar" aria-label="Actions groupées">
          <div className="places-selection-summary">
            <CircleCheck />
            <span aria-live="polite" aria-atomic="true">
              <strong>{t(selectedIds.size === 1 ? "places.bulk.selected_one" : "places.bulk.selected_other", { count: selectedIds.size })}</strong>
              {hiddenSelected > 0 && <small>{t(hiddenSelected === 1 ? "places.bulk.hidden_one" : "places.bulk.hidden_other", { count: hiddenSelected })}</small>}
            </span>
          </div>
          <div className="places-selection-actions">
            <button type="button" aria-label={visible.length > 0 && visible.every((place) => selectedIds.has(place.id)) ? t("places.bulk.unselectPage") : t("places.bulk.selectPage")} title={visible.length > 0 && visible.every((place) => selectedIds.has(place.id)) ? t("places.bulk.unselectPage") : t("places.bulk.selectPage")} onClick={togglePage}>
              <List />
              <span className="places-bulk-button-label">{visible.length > 0 && visible.every((place) => selectedIds.has(place.id)) ? t("places.bulk.unselectPage") : t("places.bulk.selectPage")}</span>
            </button>
            {poiMap?.can_edit && (
              <>
                <button type="button" disabled={!selectedIds.size} onClick={() => setBulkEditorOpen(true)} aria-label={t("places.bulk.addToTrip")} title={t("places.bulk.addToTrip")}>
                  <CalendarPlus size={15} />
                  <span className="places-bulk-button-label">{t("places.bulk.addToTrip")}</span>
                </button>
                <button className="place-bulk-delete" type="button" disabled={bulkBusy || !selectedIds.size} aria-label={t("places.bulk.delete")} title={t("places.bulk.delete")} onClick={() => void runBulk("delete")}>
                  <Trash2 />
                  <span className="places-bulk-button-label">{t("places.bulk.delete")}</span>
                </button>
              </>
            )}
          </div>
          {poiMap?.can_edit && selectedIds.size > 0 && (
            <div className="places-bulk-poi-actions" role="group" aria-label={t("places.bulk.actions")}>
              <div className="places-bulk-poi-actions__header">
                <strong>{t("places.bulk.actions")}</strong>
                <small>{t("places.bulk.description")}</small>
              </div>
              <div className="places-bulk-action-group">
                <label htmlFor="places-bulk-status">
                  <span>
                    <History />
                  </span>
                  {t("places.bulk.status")}
                </label>
                <select id="places-bulk-status" value={bulkStatusId} onChange={(event) => setBulkStatusId(event.target.value)}>
                  <option value="">{t("places.bulk.changeStatus")}</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
                <div className="places-bulk-action-group__buttons">
                  <button className="places-bulk-primary-action" type="button" disabled={bulkBusy || !bulkStatusId} aria-label={t("places.bulk.apply")} title={t("places.bulk.apply")} onClick={() => void runBulk("set_status")}>
                    <Check />
                    <span className="places-bulk-button-label">{t("places.bulk.apply")}</span>
                  </button>
                </div>
              </div>
              <div className="places-bulk-action-group">
                <label htmlFor="places-bulk-category">
                  <span>
                    <Folder />
                  </span>
                  {t("places.bulk.category")}
                </label>
                <select id="places-bulk-category" value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)}>
                  <option value="">{t("places.bulk.chooseCategory")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="places-bulk-action-group__buttons">
                  <button className="places-bulk-primary-action" type="button" disabled={bulkBusy || !bulkCategoryId} aria-label={t("places.bulk.apply")} title={t("places.bulk.apply")} onClick={() => void runBulk("set_category")}>
                    <Check />
                    <span className="places-bulk-button-label">{t("places.bulk.apply")}</span>
                  </button>
                </div>
              </div>
              <div className="places-bulk-action-group">
                <label id="places-bulk-tag-label">
                  <span>
                    <Tag />
                  </span>
                  {t("places.bulk.tag")}
                </label>
                <div className="places-bulk-tag-picker">
                  <button className="places-bulk-tag-trigger" type="button" aria-haspopup="listbox" aria-expanded={bulkTagMenuOpen} aria-labelledby="places-bulk-tag-label" onClick={() => setBulkTagMenuOpen((open) => !open)}>
                    <span>{bulkTagIds.length ? t(bulkTagIds.length === 1 ? "places.bulk.tagsSelected_one" : "places.bulk.tagsSelected_other", { count: bulkTagIds.length }) : t("places.bulk.chooseTags")}</span>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {bulkTagMenuOpen && (
                    <div className="places-bulk-tag-options" role="listbox" aria-multiselectable="true" aria-labelledby="places-bulk-tag-label">
                      <input type="search" autoFocus aria-label={t("places.bulk.searchTags")} placeholder={t("places.bulk.searchTags")} value={bulkTagQuery} onChange={(event) => setBulkTagQuery(event.target.value)} />
                      <div>
                        {tags
                          .filter((tag) => tag.name.toLocaleLowerCase(locale).includes(bulkTagQuery.trim().toLocaleLowerCase(locale)))
                          .map((tag) => {
                            const selected = bulkTagIds.includes(tag.id);
                            return (
                              <button key={tag.id} type="button" role="option" aria-selected={selected} onClick={() => setBulkTagIds((current) => (selected ? current.filter((id) => id !== tag.id) : [...current, tag.id]))}>
                                <span
                                  className="places-bulk-tag-color"
                                  style={{
                                    backgroundColor: tag.color ?? undefined,
                                  }}
                                  aria-hidden="true"
                                />
                                <span>{tag.name}</span>
                                {selected && <Check aria-hidden="true" />}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
                {bulkTagIds.length > 0 && (
                  <div className="places-bulk-selected-tags" aria-label={t("places.bulk.selectedTags")}>
                    {bulkTagIds.map((tagId) => {
                      const tag = tags.find((item) => item.id === tagId);
                      return tag ? (
                        <span key={tag.id} style={getTagColorStyle(tag.color)}>
                          {tag.name}
                          <button
                            type="button"
                            aria-label={t("places.bulk.removeSelectedTag", {
                              name: tag.name,
                            })}
                            onClick={() => setBulkTagIds((current) => current.filter((id) => id !== tag.id))}
                          >
                            <X aria-hidden="true" />
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="places-bulk-action-group__buttons">
                  <button className="places-bulk-primary-action" type="button" disabled={bulkBusy || bulkTagIds.length === 0} aria-label={t("places.bulk.add")} title={t("places.bulk.add")} onClick={() => void runBulk("add_tag")}>
                    <Plus />
                    <span className="places-bulk-button-label">{t("places.bulk.add")}</span>
                  </button>
                  <button type="button" disabled={bulkBusy || bulkTagIds.length === 0} aria-label={t("places.bulk.remove")} title={t("places.bulk.remove")} onClick={() => void runBulk("remove_tag")}>
                    <Minus />
                    <span className="places-bulk-button-label">{t("places.bulk.remove")}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {bulkEditorOpen && poiMap?.can_edit && (
            <div className="places-bulk-trip-editor">
              <select
                aria-label={t("places.bulk.trip")}
                value={tripId}
                onChange={(event) => {
                  setTripId(event.target.value);
                  setDayId("");
                }}
              >
                <option value="">{t("places.bulk.chooseTrip")}</option>
                {trips
                  .filter((trip) => trip.days.length > 0 && trip.status !== "completed" && trip.status !== "archived")
                  .map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
              </select>
              {selectedTrip && selectedTrip.status !== "completed" && selectedTrip.status !== "archived" && (
                <select aria-label={t("places.bulk.day")} value={dayId} onChange={(event) => setDayId(event.target.value)}>
                  <option value="">{t("places.bulk.chooseDay")}</option>
                  {selectedTrip.days.map((day) => (
                    <option key={day.id} value={day.id}>
                      Jour {day.day_number}
                    </option>
                  ))}
                </select>
              )}
              <button className="place-bulk-add-to-active-day" type="button" disabled={bulkBusy || !dayId} onClick={() => void addToTrip()}>
                {t("places.bulk.addToSelectedTrip")}
              </button>
            </div>
          )}
        </section>
      )}
      {bulkError && (
        <p className="form-alert" role="alert">
          {bulkError}
        </p>
      )}
      {bulkNotice && (
        <p className="form-success" role="status">
          {bulkNotice}
        </p>
      )}
      <div ref={listBodyRef} className="place-list-body cv-workspace-panel__content">
        {!poiMap && <p className="place-list-message">Sélectionnez une carte pour afficher ses POI.</p>}
        {loading && visible.length === 0 && <SkeletonList rows={6} label="Chargement des lieux" />}
        {error && (
          <p role="alert" className="place-list-load-error">
            {error}
            <button type="button" onClick={() => setListRequestVersion((value) => value + 1)}>
              Réessayer
            </button>
          </p>
        )}
        {visible.length > 0 && displayMode === "gallery" && <PlaceGallery places={visible} selectedPlaceId={selectedPlaceId} selectedIds={selectedIds} selectionMode={selectionMode} tripPlaceIds={tripPlaceIds} tripPlanningActive={tripPlanningActive} onPlaceSelect={onPlaceSelect} onToggleSelected={toggleSelected} />}
        {visible.length > 0 && displayMode !== "gallery" && (
          <VirtualPlaceRows
            items={visible}
            scrollRoot={listBodyRef}
            estimatedRowHeight={displayMode === "expanded" ? 156 : 64}
            className={`country-place-list cv-workspace-panel__list places-redesign-list ${displayMode}`}
            getItemKey={(place) => place.id}
            scrollToIndex={selectedPlaceIndex >= 0 ? selectedPlaceIndex : undefined}
            renderVersion={placeRowsVersion}
            renderRow={(place) => {
              const primary = place.categories.find((item) => item.is_primary) ?? place.categories[0];
              const inTrip = tripPlaceIds.has(place.id);
              const isSelected = place.id === selectedPlaceId;
              const rating = formatRating(place);
              const canAddToTripTarget = tripAddTargetLabel !== null;
              const swipeOffset = mobilePlaceSwipe?.placeId === place.id ? mobilePlaceSwipe.offset : mobilePlaceSwipeOpen?.placeId === place.id ? (mobilePlaceSwipeOpen.direction === "delete" ? 92 : -116) : 0;
              const deleteRevealWidth = Math.max(0, swipeOffset);
              const moreRevealWidth = Math.max(0, -swipeOffset);
              return (
                <article
                  className={`places-place-card${isSelected ? " selected" : ""}${inTrip ? " trip-included" : ""}${selectionMode ? " has-selection" : ""}`}
                  onPointerDown={(event) => beginMobilePlaceSwipe(event, place.id)}
                  onPointerMove={moveMobilePlaceSwipe}
                  onPointerUp={finishMobilePlaceSwipe}
                  onPointerCancel={() => {
                    mobileSwipeStart.current = null;
                    mobileSwipeOffset.current = 0;
                    setMobilePlaceSwipe(null);
                  }}
                >
                  {poiMap?.can_edit !== false && (
                    <button className="places-mobile-swipe-action places-mobile-swipe-action--delete" style={{ width: `${deleteRevealWidth}px` }} type="button" aria-hidden={swipeOffset <= 0} tabIndex={swipeOffset > 0 ? 0 : -1} aria-label={`Supprimer ${place.name}`} onClick={() => void removePlace(place)}>
                      <Trash2 size={18} />
                    </button>
                  )}
                  <div className="places-mobile-swipe-action places-mobile-swipe-action--more" style={{ width: `${moreRevealWidth}px` }} aria-hidden={swipeOffset >= 0}>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude ?? ""},${place.longitude ?? ""}`)}`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${place.name} dans Google Maps`}>
                      <GoogleMapsIcon size={26} />
                    </a>
                    {poiMap?.can_edit !== false && (
                      <Link to={withMap(`/places/${place.id}/edit`, poiMap?.id)} aria-label={`Éditer ${place.name}`}>
                        <Pencil size={17} />
                      </Link>
                    )}
                  </div>
                  <div className="places-place-card-row" style={{ transform: `translateX(${swipeOffset}px)` }}>
                    {selectionMode && <input className="place-list-select" type="checkbox" aria-label={`Sélectionner ${place.name}`} checked={selectedIds.has(place.id)} onChange={() => toggleSelected(place.id)} />}
                    <button
                      ref={(node) => {
                        if (node) refs.current.set(place.id, node);
                        else refs.current.delete(place.id);
                      }}
                      type="button"
                      data-place-row-focus
                      aria-label={`${place.name}${inTrip ? " — déjà présent dans la sortie" : ""}`}
                      draggable={tripPlanningActive}
                      className="places-place-main"
                      onDragStart={(event) => {
                        if (tripPlanningActive) {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData("application/x-cartavault-place", place.id);
                          event.dataTransfer.setData("text/plain", `place:${place.id}`);
                        }
                      }}
                      onClick={() => {
                        if (mobileSwipeMoved.current) {
                          mobileSwipeMoved.current = false;
                          return;
                        }
                        onPlaceSelect(place);
                      }}
                    >
                      {displayMode === "expanded" && (
                        <span className="places-place-photo">
                          {inTrip && (
                            <span className="places-place-trip-check" aria-hidden="true" title="Déjà présent dans la sortie">
                              <Check size={12} aria-hidden="true" />
                            </span>
                          )}
                          <PlaceListThumbnail photoId={place.primary_photo_id} statusColor={place.status.color} categoryIcon={primary?.icon} />
                        </span>
                      )}
                      {displayMode === "compact" && (
                        <span
                          className="place-list-category-bubble"
                          style={{
                            backgroundColor: place.status.color,
                            borderColor: place.status.color,
                          }}
                        >
                          <CategoryIconPreview iconId={primary?.icon} size={18} showLabel={false} />
                        </span>
                      )}
                      <span className="places-place-copy">
                        <strong title={place.name}>{place.name}</strong>
                        {displayMode === "expanded" ? (
                          <>
                            <span className="places-place-location">{formatLocation(place)}</span>
                            <span className="places-place-category">
                              {primary && (
                                <>
                                  <CategoryIconPreview iconId={primary.icon} size={14} showLabel={false} />
                                  {primary.name}
                                  <i aria-hidden="true">–</i>
                                </>
                              )}
                              <b className="places-place-status" style={{ color: place.status.color }}>
                                {place.status.name}
                              </b>
                            </span>
                            <span className="places-place-bottom">
                              {place.tags.map((tag) => (
                                <span className="place-list-tag" key={tag.id} style={getTagColorStyle(tag.color)}>
                                  {tag.name}
                                </span>
                              ))}
                              <span className="places-place-rating" style={{ color: place.status.color }} aria-label={rating == null ? "Aucune note" : `Note ${rating}`}>
                                ★ {rating ?? "—"}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="place-list-item-meta">
                            {primary && (
                              <>
                                <span>{primary.name}</span>
                                <span aria-hidden="true">–</span>
                              </>
                            )}
                            <b className="places-place-status" style={{ color: place.status.color }}>
                              {place.status.name}
                            </b>
                          </span>
                        )}
                      </span>
                    </button>
                    {displayMode === "expanded" && (
                      <aside className="places-place-actions" aria-label={`Actions pour ${place.name}`}>
                        <button className={place.is_favorite ? "favorite active" : "favorite"} type="button" aria-label={place.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => void toggleFavorite(place)}>
                          <Heart size={20} fill={place.is_favorite ? "currentColor" : "none"} />
                        </button>
                        <div>
                          <span className="places-map-actions">
                            {canAddToTripTarget && (
                              <span className="places-trip-add-slot">
                                <button
                                  className="places-trip-add-button"
                                  type="button"
                                  aria-label={tripAddTargetLabel}
                                  title={tripAddTargetLabel}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onTripPlaceAdd(place);
                                  }}
                                >
                                  <Plus size={16} aria-hidden="true" />
                                </button>
                              </span>
                            )}
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude ?? ""},${place.longitude ?? ""}`)}`} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${place.name} dans Google Maps`} onClick={(event) => event.stopPropagation()}>
                              <GoogleMapsIcon size={24} />
                            </a>
                          </span>
                          {poiMap?.can_edit !== false && (
                            <Link to={withMap(`/places/${place.id}/edit`, poiMap?.id)} aria-label={`Éditer ${place.name}`} onClick={(event) => event.stopPropagation()}>
                              <Pencil size={16} />
                            </Link>
                          )}
                          {poiMap?.can_edit !== false && (
                            <button type="button" aria-label={`Supprimer ${place.name}`} onClick={() => void removePlace(place)}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </aside>
                    )}
                  </div>
                </article>
              );
            }}
          />
        )}
        {!loading && poiMap && visible.length === 0 && <EmptyState className="place-list-message" icon={<Search size={24} />} title={t("places.empty")} />}
        {hasMore && <div ref={loadMoreSentinel} className="place-list-load-sentinel" aria-hidden="true" />}
        {loadingMore && (
          <p className="place-list-loading-more" role="status">
            {t("places.loadingMore")}
          </p>
        )}
        {hasMore && typeof IntersectionObserver === "undefined" && (
          <button className="place-list-more" type="button" onClick={() => void loadMore()}>
            {t("places.loadMore")}
          </button>
        )}
      </div>
      {canImportKmz && importing && poiMap && <KmzImportDialog poiMap={poiMap} onClose={() => setImporting(false)} onImported={onImported} />}
      {confirmationDialog}
    </aside>
  );
  /*
  return <aside className="country-place-panel cv-workspace-panel" id="map-place-list" tabIndex={-1} aria-labelledby="map-place-list-title"><header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow place-list-kicker">Lieux</p><h2 id="map-place-list-title" className="cv-workspace-panel__title">{poiMap?.country?.name ?? poiMap?.name ?? 'Points d’intérêt'}</h2>{poiMap && <p className="place-list-map-meta">{formatLastUpdate(poiMap.updated_at)}</p>}</div><div className="cv-workspace-panel__header-actions">{poiMap && <span className="cv-workspace-panel__count">{facets.with_coordinates + facets.without_coordinates || visible.length} POI</span>}{poiMap && <button className={`panel-icon-button${selectionMode ? ' primary' : ''}`} type="button" aria-label="Sélection multiple" onClick={() => { setSelectionMode((value) => !value); setSelectedIds(new Set()) }}><CheckSquare size={18} /></button>}{poiMap && !tripPlanningActive && poiMap.can_import !== false && <button className="panel-icon-button" type="button" aria-label="Importer un fichier KMZ" onClick={() => setImporting(true)}><FileUp size={18} /></button>}{poiMap && poiMap.can_edit !== false && <Link className="panel-icon-button primary" to={withMap('/places/new', poiMap.id)} aria-label="Ajouter un POI"><Plus size={18} /></Link>}<button className="panel-icon-button" type="button" aria-label="Fermer le panneau" onClick={onClose}><X size={18} /></button></div></header>
    {poiMap && <section className="place-list-controls" aria-label="Recherche et filtres des lieux"><label className="place-list-search"><Search aria-hidden="true" size={18} /><span className="visually-hidden">Rechercher un POI</span><input type="search" value={filters.query} placeholder="Rechercher un POI…" onChange={(event) => update({ query: event.target.value })} />{filters.query && <button type="button" aria-label="Effacer la recherche" onClick={() => update({ query: '' })}><X size={15} /></button>}</label><div className="place-list-filters"><button className={hasActivePlaceFilters(filters) ? 'is-active' : ''} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><Filter size={15} />Filtres{activeCount ? ` (${activeCount})` : ''}</button><button className="place-list-reset" type="button" onClick={() => onFiltersChange(DEFAULT_PLACE_FILTERS)} disabled={!hasActivePlaceFilters(filters)}>Réinitialiser</button></div>{filtersOpen && <div className="place-filter-drawer" role="region" aria-label="Filtres avancés">{multiOptions('Catégories', categories.map((item) => ({ ...item, count: facets.categories.find((facet) => facet.id === item.id)?.count ?? 0 })), filters.categoryIds, (categoryIds) => update({ categoryIds }))}{multiOptions('Tags', tags.map((item) => ({ ...item, count: facets.tags.find((facet) => facet.id === item.id)?.count ?? 0 })), filters.tagIds, (tagIds) => update({ tagIds }))}{multiOptions('Statuts', statuses.map((item) => ({ id: item.id, name: item.name, color: item.color, count: facets.statuses.find((facet) => facet.id === item.id)?.count ?? 0 })), filters.statusIds, (statusIds) => update({ statusIds }))}{multiOptions('Régions', facets.regions.map((item) => ({ id: item.value ?? '', name: item.value ?? '', count: item.count })), filters.regions, (regions) => update({ regions }))}<details className="place-filter-group"><summary>Photos, coordonnées et sortie</summary><div>{boolControl('Photos', filters.hasPhotos, (hasPhotos) => update({ hasPhotos }))}{boolControl('Coordonnées valides', filters.hasValidCoordinates, (hasValidCoordinates) => update({ hasValidCoordinates }))}{boolControl('Présent dans une sortie', filters.inTrip, (inTrip) => update({ inTrip }))}</div></details><details className="place-filter-group"><summary>Dates et informations</summary><div><label>Créé à partir du<input type="date" value={filters.createdFrom ?? ''} onChange={(event) => update({ createdFrom: event.target.value || null })} /></label><label>Créé jusqu’au<input type="date" value={filters.createdTo ?? ''} onChange={(event) => update({ createdTo: event.target.value || null })} /></label><label>Modifié à partir du<input type="date" value={filters.updatedFrom ?? ''} onChange={(event) => update({ updatedFrom: event.target.value || null })} /></label><label>Modifié jusqu’au<input type="date" value={filters.updatedTo ?? ''} onChange={(event) => update({ updatedTo: event.target.value || null })} /></label></div></details></div>}</section>}
    {selectionMode && <section className="place-bulk-bar" aria-label="Actions groupées"><strong>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}{hiddenSelected ? `, dont ${hiddenSelected} masqués` : ''}</strong><button type="button" onClick={togglePage}>{visible.length > 0 && visible.every((place) => selectedIds.has(place.id)) ? 'Désélectionner la page' : 'Sélectionner la page'}</button><button type="button" onClick={() => setSelectedIds(new Set())}>Tout désélectionner</button>{poiMap?.can_edit && <><select aria-label="Nouveau statut" value={bulkStatusId} onChange={(event) => setBulkStatusId(event.target.value)}><option value="">Changer le statut…</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select><button type="button" disabled={bulkBusy || !bulkStatusId || !selectedIds.size} onClick={() => void runBulk('set_status')}>Appliquer</button><select aria-label="Catégorie groupée" value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)}><option value="">Catégorie…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" disabled={bulkBusy || !bulkCategoryId || !selectedIds.size} onClick={() => void runBulk('add_category')}>Ajouter</button><button type="button" disabled={bulkBusy || !bulkCategoryId || !selectedIds.size} onClick={() => void runBulk('remove_category')}>Retirer</button><select aria-label="Tag groupé" value={bulkTagId} onChange={(event) => setBulkTagId(event.target.value)}><option value="">Tag…</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><button type="button" disabled={bulkBusy || !bulkTagId || !selectedIds.size} onClick={() => void runBulk('add_tag')}>Ajouter</button><button type="button" disabled={bulkBusy || !bulkTagId || !selectedIds.size} onClick={() => void runBulk('remove_tag')}>Retirer</button><select aria-label="Sortie" value={tripId} onChange={(event) => setTripId(event.target.value)}><option value="">Ajouter à une sortie…</option>{trips.filter((trip) => trip.days.length > 0).map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}</select>{selectedTrip && <select aria-label="Journée" value={dayId} onChange={(event) => setDayId(event.target.value)}><option value="">Journée…</option>{selectedTrip.days.map((day) => <option key={day.id} value={day.id}>Jour {day.day_number}</option>)}</select>}<button type="button" disabled={bulkBusy || !dayId || !selectedIds.size} onClick={() => void addToTrip()}>Ajouter à la sortie</button><button className="place-bulk-delete" type="button" disabled={bulkBusy || !selectedIds.size} onClick={() => void runBulk('delete')}><Trash2 size={15} />Supprimer</button></>}</section>}
    {bulkError && <p className="form-alert" role="alert">{bulkError}</p>}{bulkNotice && <p className="form-success" role="status">{bulkNotice}</p>}<div className="place-list-body cv-workspace-panel__content">{!poiMap && <p className="place-list-message">Sélectionnez une carte pour afficher ses POI.</p>}{loading && <p role="status">Chargement…</p>}{error && <p role="alert">{error}</p>}{visible.length > 0 && <ul className="country-place-list cv-workspace-panel__list">{visible.map((place) => { const primary = place.categories.find((item) => item.is_primary) ?? place.categories[0]; const inTrip = tripPlaceIds.has(place.id); return <li key={place.id}><div className="place-list-row">{selectionMode && <input className="place-list-select" type="checkbox" aria-label={`Sélectionner ${place.name}`} checked={selectedIds.has(place.id)} onChange={() => toggleSelected(place.id)} />}<button ref={(node) => { if (node) refs.current.set(place.id, node); else refs.current.delete(place.id) }} type="button" draggable={tripPlanningActive && !inTrip} className={`place-list-item cv-workspace-panel__card${place.id === selectedPlaceId ? ' selected' : ''}${inTrip ? ' trip-added' : ''}`} onDragStart={(event) => { if (tripPlanningActive && !inTrip) { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-cartavault-place', place.id); event.dataTransfer.setData('text/plain', `place:${place.id}`) } }} onClick={() => onPlaceSelect(place)}><span className="place-list-category-bubble" style={{ backgroundColor: place.status.color, borderColor: place.status.color }}><CategoryIconPreview iconId={primary?.icon} size={18} showLabel={false} ariaLabel={`Catégorie ${primary?.name ?? 'non définie'}, statut ${place.status.name}`} /></span><span className="place-list-item-content"><strong>{place.name}{inTrip && <small className="place-list-trip-badge">Ajouté</small>}</strong><span className="place-list-item-meta"><span>{place.status.name}</span>{primary && <><span aria-hidden="true">·</span><span>{primary.name}</span></>}</span>{place.tags.length > 0 && <span className="place-list-tags">{place.tags.map((tag) => <span className="place-list-tag" key={tag.id}>{tag.name}</span>)}</span>}</span></button></div></li> })}</ul>}{!loading && poiMap && visible.length === 0 && <p className="place-list-message">Aucun POI ne correspond aux filtres.</p>}{hasMore && <button className="place-list-more" type="button" onClick={() => void loadMore()}>Charger plus</button>}</div>{!tripPlanningActive && importing && poiMap && <KmzImportDialog poiMap={poiMap} onClose={() => setImporting(false)} onImported={onImported} />}</aside>
  */
}
