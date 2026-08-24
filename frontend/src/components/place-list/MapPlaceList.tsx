import { ArrowUpDown, CalendarPlus, Check, CircleCheck, ChevronDown, Heart, History, Folder, Grid2X2, LayoutList, List, Minus, MoreHorizontal, Pencil, Plus, Search, RotateCcw, SlidersHorizontal, Tag, Trash2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleMapsIcon } from "../common/GoogleMapsIcon";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { bulkAddPlacesToTrip, bulkUpdatePlaces, deletePlace, getPlaceDetails, getPlaceFacets, getPlaces, restorePlace, updatePlace } from "../../api/places";
import { publishGlobalFeedback } from "../common/globalFeedback";
import { getCategories } from "../../api/categories";
import { getTags } from "../../api/tags";
import { getTrip, listTrips, restoreTripState } from "../../api/trips";
import { DEFAULT_PLACE_FILTERS, countActiveAdvancedPlaceFilters, hasActiveAdvancedPlaceFilters, normalizePlaceFilters, resetAdvancedPlaceFilters } from "../../places/placeFilters";
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
import { getTagColorStyle } from "../../tags/tagColors";
import { VirtualPlaceRows } from "./VirtualPlaceRows";
import { PlaceListThumbnail } from "./PlaceListThumbnail";
import { PlaceGallery } from "./PlaceGallery";
import { SkeletonList } from "../common/Skeleton";
import { EmptyState } from "../common/EmptyState";
import { FloatingPanelWindowContext } from "../layout/FloatingPanelWindow";
import { PanelWindowControls } from "../layout/PanelWindowControls";
import { PlaceMapPopup } from "../map-popup/PlaceMapPopup";
import { PlaceInlineThumbnailGallery } from "./PlaceInlineThumbnailGallery";

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
  onPlaceCollapse?: () => void;
  onPlaceDeleted?: (placeId: string) => void;
  onClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onImported?: () => void;
  onBulkChanged?: () => void;
  onBulkTripChanged?: (tripId: string) => void;
  tripPlaceDropEnabled?: boolean;
  hideCreateAction?: boolean;
  tripTargets?: Array<{ id: string; label: string }>;
  onAddToTripTarget?: (place: PlaceDetails, targetId: string) => Promise<void> | void;
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

export function MapPlaceList({ poiMap, statuses = [], filters = DEFAULT_PLACE_FILTERS, selectedPlaceId, refreshVersion, removedPlaceId, onFiltersChange = () => undefined, onPlaceSelect, onPlaceCollapse = () => undefined, onPlaceDeleted = () => undefined, collapsed = false, onCollapsedChange = () => undefined, onImported = () => undefined, onBulkChanged = () => undefined, onBulkTripChanged = () => undefined, tripPlaceDropEnabled = false, hideCreateAction = false, tripTargets = [], onAddToTripTarget, importRequest = 0, selectionMode: controlledSelectionMode, selectedPlaceIds: controlledSelectedIds, onSelectionModeChange, onSelectedPlaceIdsChange }: Props) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const panelWindow = useContext(FloatingPanelWindowContext);
  const [places, setPlaces] = useState<PlaceDetails[]>([]);
  const [pinnedSelectedPlace, setPinnedSelectedPlace] = useState<PlaceDetails | null>(null);
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
  const [secondaryActionsOpen, setSecondaryActionsOpen] = useState(false);
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
  const effectiveCollapsed = isMobileViewport ? collapsed : panelWindow ? panelWindow.mode === "collapsed" : collapsed;
  const [displayMode, setDisplayMode] = useState<"expanded" | "gallery">("expanded");
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
  const listRequest = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const loadMoreRequest = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  const selectionRequest = useRef(0);
  const selectionController = useRef<AbortController | null>(null);
  const { setFilter: setMarkerFilter } = useContext(MapMarkerFilterContext);
  const canImportKmz = poiMap?.can_import !== false && !isMobileViewport;
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
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    if (isMobileViewport) setImporting(false);
  }, [isMobileViewport]);
  useEffect(() => {
    if (importRequest > 0 && poiMap?.can_import !== false && !isMobileViewport) setImporting(true);
  }, [importRequest, isMobileViewport, poiMap]);
  useEffect(() => {
    selectionController.current?.abort();
    selectionRequest.current += 1;
    setPinnedSelectedPlace(null);
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

  const loadedPlaces = useMemo(() => sortPlaces(places.filter((place) => place.id !== removedPlaceId)), [places, removedPlaceId]);
  const visible = useMemo(() => {
    if (
      pinnedSelectedPlace === null ||
      pinnedSelectedPlace.id !== selectedPlaceId ||
      pinnedSelectedPlace.id === removedPlaceId ||
      loadedPlaces.some((place) => place.id === pinnedSelectedPlace.id)
    ) return loadedPlaces;
    return [pinnedSelectedPlace, ...loadedPlaces];
  }, [loadedPlaces, pinnedSelectedPlace, removedPlaceId, selectedPlaceId]);
  const selectedTrip = trips.find((trip) => trip.id === tripId);
  const hiddenSelected = [...selectedIds].filter((id) => !visible.some((place) => place.id === id)).length;
  const activeCount = countActiveAdvancedPlaceFilters(filters);
  const advancedFilterChips: Array<{ key: string; label: string; remove: () => void }> = [];
  const addListChips = (prefix: string, values: string[], choices: Array<{ id: string; name: string }>, key: "categoryIds" | "tagIds" | "statusIds" | "regions" | "dangerLevels" | "conditionValues") => {
    values.forEach((value) => advancedFilterChips.push({ key: `${prefix}:${value}`, label: choices.find((choice) => choice.id === value)?.name ?? value, remove: () => update({ [key]: values.filter((item) => item !== value) }) }));
  };
  addListChips("category", filters.categoryIds, categories, "categoryIds");
  addListChips("tag", filters.tagIds, tags, "tagIds");
  addListChips("status", filters.statusIds, statuses, "statusIds");
  addListChips("region", filters.regions, filters.regions.map((value) => ({ id: value, name: value })), "regions");
  addListChips("danger", filters.dangerLevels, filters.dangerLevels.map((value) => ({ id: value, name: value })), "dangerLevels");
  addListChips("condition", filters.conditionValues, filters.conditionValues.map((value) => ({ id: value, name: value })), "conditionValues");
  const addScalarChip = (key: keyof PlaceFilters, label: string, active: boolean) => { if (active) advancedFilterChips.push({ key: String(key), label, remove: () => update({ [key]: null }) }) };
  addScalarChip("hasPhotos", `Photos : ${filters.hasPhotos ? "oui" : "non"}`, filters.hasPhotos !== null);
  addScalarChip("hasValidCoordinates", `Coordonnées : ${filters.hasValidCoordinates ? "oui" : "non"}`, filters.hasValidCoordinates !== null);
  addScalarChip("inTrip", `Dans une sortie : ${filters.inTrip ? "oui" : "non"}`, filters.inTrip !== null);
  addScalarChip("ratingMin", `Note ≥ ${filters.ratingMin}/5`, filters.ratingMin !== null);
  addScalarChip("createdFrom", `Créé après le ${filters.createdFrom}`, Boolean(filters.createdFrom));
  addScalarChip("createdTo", `Créé avant le ${filters.createdTo}`, Boolean(filters.createdTo));
  addScalarChip("updatedFrom", `Modifié après le ${filters.updatedFrom}`, Boolean(filters.updatedFrom));
  addScalarChip("updatedTo", `Modifié avant le ${filters.updatedTo}`, Boolean(filters.updatedTo));
  useEffect(() => {
    setQueryInput(filters.query);
  }, [filters.query]);
  useEffect(() => {
    if (queryInput === filters.query) return;
    const timeout = window.setTimeout(() => update({ query: queryInput }), 300);
    return () => window.clearTimeout(timeout);
  }, [filters.query, queryInput, update]);
  const selectedPlaceIndex = selectedPlaceId === null ? -1 : visible.findIndex((place) => place.id === selectedPlaceId);
  const placeRowsVersion = [displayMode, selectedPlaceId ?? "", isMobileViewport ? "mobile" : "desktop", selectionMode ? "selection" : "", [...selectedIds].sort().join(","), poiMap?.can_edit === false ? "readonly" : "editable", mobilePlaceSwipe ? `${mobilePlaceSwipe.placeId}:${mobilePlaceSwipe.offset}` : "", mobilePlaceSwipeOpen ? `${mobilePlaceSwipeOpen.placeId}:${mobilePlaceSwipeOpen.direction}` : ""].join("|");
  useEffect(() => {
    selectionController.current?.abort();
    selectionRequest.current += 1;
    if (!listReady || !selectedPlaceId || selectedPlaceId === removedPlaceId || !poiMap) {
      setPinnedSelectedPlace(null);
      return;
    }
    if (places.some((place) => place.id === selectedPlaceId)) {
      setPinnedSelectedPlace(null);
      return;
    }
    if (pinnedSelectedPlace?.id === selectedPlaceId) return;
    const controller = new AbortController();
    selectionController.current = controller;
    const requestId = selectionRequest.current;
    const requestedPlaceId = selectedPlaceId;
    const requestedMapId = poiMap.id;
    setError(null);
    void getPlaceDetails(requestedPlaceId, controller.signal)
      .then((place) => {
        if (controller.signal.aborted || requestId !== selectionRequest.current) return;
        if (place.id !== requestedPlaceId || place.map_id !== requestedMapId) return;
        setPinnedSelectedPlace(place);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted && requestId === selectionRequest.current) setError(caught instanceof Error ? caught.message : "Impossible de charger ce lieu dans la liste.");
      });
    return () => controller.abort();
  }, [listReady, pinnedSelectedPlace, places, poiMap, removedPlaceId, selectedPlaceId]);
  useEffect(() => {
    setPinnedSelectedPlace(null);
  }, [refreshVersion]);
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
    if (!sentinel || !hasMore || effectiveCollapsed || typeof IntersectionObserver === "undefined") return;
    const root = sentinel.closest<HTMLElement>(".place-list-body");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "0px 0px 240px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [effectiveCollapsed, hasMore, loadMore]);
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
      setPinnedSelectedPlace((current) => current?.id === place.id ? null : current);
      onPlaceDeleted(place.id);
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
    <label>
      {label}
      <select value={value === null ? "" : String(value)} onChange={(event) => apply(event.target.value === "" ? null : event.target.value === "true")}>
        <option value="">Tous</option>
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>
    </label>
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

  if (!isMobileViewport && panelWindow && effectiveCollapsed) {
    return (
      <aside className="country-place-panel cv-workspace-panel places-redesign-panel is-collapsed cv-places-compact-rail" id="map-place-list" tabIndex={-1} aria-label={t("places.title")}>
        <header className="places-redesign-header cv-places-compact-rail__header">
          {!hideCreateAction && poiMap?.can_edit !== false && <Link className="panel-icon-button primary cv-places-compact-rail__create" to={withMap("/places/new", poiMap?.id)} aria-label={t("places.new")} title={t("places.new")}><Plus size={19} aria-hidden="true" /></Link>}
          <PanelWindowControls />
        </header>
        <div className="cv-places-compact-rail__list" role="list" aria-label={t("places.title")}>
          {visible.map((place) => {
            const primary = categories.find((category) => category.id === place.categories[0]?.id);
            return <button key={place.id} type="button" role="listitem" className={`cv-places-compact-rail__item${selectedPlaceId === place.id ? " is-selected" : ""}`} aria-label={place.name} title={place.name} aria-current={selectedPlaceId === place.id ? "true" : undefined} onClick={() => onPlaceSelect(place)}><PlaceListThumbnail photoId={place.primary_photo_id} statusColor={place.status.color} categoryIcon={primary?.icon} /></button>;
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className={`country-place-panel cv-workspace-panel places-redesign-panel${effectiveCollapsed ? " is-collapsed" : ""}`} id="map-place-list" tabIndex={-1} aria-labelledby="map-place-list-title">
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
          {poiMap?.updated_at && <p className="places-redesign-updated"><time dateTime={poiMap.updated_at}>{t("places.updatedAt", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(poiMap.updated_at)) })}</time></p>}
        </div>
        <div className="places-redesign-header-actions">
          <PanelWindowControls />
          <button className="panel-icon-button places-collapse-toggle mobile-panel-collapse-toggle" type="button" aria-label={collapsed ? t("places.expandPanel") : t("places.closePanel")} aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)}><ChevronDown size={18} aria-hidden="true" /></button>
        </div>
      </header>
      {poiMap && (
        <section className="places-redesign-controls" aria-label={t("places.controls")}>
          <div className="places-search-create-row">
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
            {!hideCreateAction && poiMap.can_edit !== false && (
              <Link className="primary-button places-search-create" to={withMap("/places/new", poiMap.id)} aria-label={t("places.add")} title={t("places.add")}>
                <Plus size={18} aria-hidden="true" />
                <span>{t("places.add")}</span>
              </Link>
            )}
          </div>
          <nav className="places-quick-filters" aria-label={t("places.quickFilters")}>
            <button type="button" className={filters.functionalState === null && filters.isFavorite !== true ? "active" : ""} aria-pressed={filters.functionalState === null && filters.isFavorite !== true} onClick={() => update({ functionalState: null, isFavorite: null })}>
              {t("places.all")}
              <small>{facets.total}</small>
            </button>
            <button
              type="button"
              className={filters.functionalState === "non_visited" ? "active" : ""}
              aria-pressed={filters.functionalState === "non_visited"}
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
              aria-pressed={filters.functionalState === "visited"}
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
              aria-pressed={filters.isFavorite === true}
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
          {!selectionMode && (
            <div className="places-redesign-toolbar">
              <div className="places-view-switcher" role="group" aria-label={t("places.displayMode")}>
                <button type="button" className={displayMode === "expanded" ? "active" : ""} aria-pressed={displayMode === "expanded"} aria-label={t("places.expandedView")} title={t("places.expandedView")} onClick={() => setDisplayMode("expanded")}>
                  <LayoutList size={18} />
                </button>
                <button type="button" className={displayMode === "gallery" ? "active" : ""} aria-pressed={displayMode === "gallery"} aria-label={t("places.galleryView")} title={t("places.galleryView")} onClick={() => setDisplayMode("gallery")}>
                  <Grid2X2 size={18} />
                </button>
              </div>
              <label className="places-sort-control">
                <ArrowUpDown size={17} aria-hidden="true" />
                <span className="visually-hidden">{t("places.sort")}</span>
                <select
                  aria-label={t("places.sort")}
                  value={`${filters.sortBy}:${filters.sortDirection}`}
                  onChange={(event) => {
                    const [sortBy, sortDirection] = event.target.value.split(":") as [PlaceFilters["sortBy"], PlaceFilters["sortDirection"]];
                    update({ sortBy, sortDirection });
                  }}
                >
                  <option value="name:asc">Nom A → Z</option>
                  <option value="name:desc">Nom Z → A</option>
                  <option value="created_at:desc">Ajout — plus récent</option>
                  <option value="created_at:asc">Ajout — plus ancien</option>
                  <option value="updated_at:desc">Modification — plus récente</option>
                  <option value="updated_at:asc">Modification — plus ancienne</option>
                  <option value="interest_rating:desc">Intérêt — note décroissante</option>
                  <option value="interest_rating:asc">Intérêt — note croissante</option>
                  <option value="favorite:desc">Favoris — favoris d’abord</option>
                  <option value="favorite:asc">Favoris — non favoris d’abord</option>
                  <option value="status:asc">Statut A → Z</option>
                  <option value="status:desc">Statut Z → A</option>
                  <option value="country:asc">Pays A → Z</option>
                  <option value="country:desc">Pays Z → A</option>
                  <option value="city:asc">Ville A → Z</option>
                  <option value="city:desc">Ville Z → A</option>
                </select>
              </label>
              <button className={`places-advanced-filter${filtersOpen ? " active" : ""}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
                <SlidersHorizontal size={17} aria-hidden="true" />
                {t("places.filters")}
                {activeCount > 0 && <span className="places-filter-count" aria-label={t("places.activeFilterCount", { count: activeCount })}>{activeCount}</span>}
              </button>
              {poiMap && (
                <div className="places-secondary-actions">
                  <button className="places-secondary-actions__toggle" type="button" aria-label={t("places.moreActions")} title={t("places.moreActions")} aria-expanded={secondaryActionsOpen} onClick={() => setSecondaryActionsOpen((open) => !open)}>
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {secondaryActionsOpen && (
                    <div className="places-secondary-actions__menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setSecondaryActionsOpen(false); replaceSelectionMode(true); replaceSelectedIds(new Set()) }}>
                        <Check size={16} aria-hidden="true" />
                        {t("places.select")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {advancedFilterChips.length > 0 && (
            <div className="places-active-filters" aria-label={t("places.activeFilters")}>
              <div>
                {advancedFilterChips.map((chip) => (
                  <span className="places-filter-chip" key={chip.key}>
                    {chip.label}
                    <button type="button" aria-label={t("places.removeFilter", { name: chip.label })} onClick={chip.remove}><X size={13} aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
              {advancedFilterChips.length > 1 && <button className="places-clear-filters" type="button" onClick={() => onFiltersChange(resetAdvancedPlaceFilters(filters))}>{t("places.clearFilters")}</button>}
            </div>
          )}
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
              <details className="place-filter-group">
                <summary>Dates et note</summary>
                <div>
                  <label>Note minimale<select value={filters.ratingMin ?? ""} onChange={(event) => update({ ratingMin: event.target.value ? Number(event.target.value) : null })}><option value="">Toutes</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label>
                  <label>Créé à partir du<input type="date" value={filters.createdFrom ?? ""} onChange={(event) => update({ createdFrom: event.target.value || null })} /></label>
                  <label>Créé jusqu’au<input type="date" value={filters.createdTo ?? ""} onChange={(event) => update({ createdTo: event.target.value || null })} /></label>
                  <label>Modifié à partir du<input type="date" value={filters.updatedFrom ?? ""} onChange={(event) => update({ updatedFrom: event.target.value || null })} /></label>
                  <label>Modifié jusqu’au<input type="date" value={filters.updatedTo ?? ""} onChange={(event) => update({ updatedTo: event.target.value || null })} /></label>
                </div>
              </details>
              <button className="place-filter-reset-button" type="button" onClick={() => onFiltersChange(resetAdvancedPlaceFilters(filters))} disabled={!hasActiveAdvancedPlaceFilters(filters)}>
                <RotateCcw aria-hidden="true" size={15} />
                Réinitialiser les filtres avancés
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
            <button type="button" aria-label={t("places.cancelSelection")} title={t("places.cancelSelection")} onClick={() => { replaceSelectionMode(false); replaceSelectedIds(new Set()) }}>
              <X size={15} aria-hidden="true" />
              <span className="places-bulk-button-label">{t("places.cancelSelection")}</span>
            </button>
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
        {visible.length > 0 && displayMode === "gallery" && <PlaceGallery places={visible} selectedPlaceId={selectedPlaceId} selectedIds={selectedIds} selectionMode={selectionMode} onPlaceSelect={onPlaceSelect} onToggleSelected={toggleSelected} />}
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
              const isSelected = place.id === selectedPlaceId;
              const inlineExpanded = isSelected && !isMobileViewport;
              const rating = formatRating(place);
              const swipeOffset = mobilePlaceSwipe?.placeId === place.id ? mobilePlaceSwipe.offset : mobilePlaceSwipeOpen?.placeId === place.id ? (mobilePlaceSwipeOpen.direction === "delete" ? 92 : -116) : 0;
              const deleteRevealWidth = Math.max(0, swipeOffset);
              const moreRevealWidth = Math.max(0, -swipeOffset);
              return (
                <article
                  className={`places-place-card${isSelected ? " selected" : ""}${inlineExpanded ? " has-inline-details" : ""}${selectionMode ? " has-selection" : ""}`}
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
                    {inlineExpanded && (
                      <PlaceInlineThumbnailGallery placeId={place.id} placeName={place.name} statusColor={place.status.color} categoryIcon={primary?.icon} />
                    )}
                    {inlineExpanded && (
                      <button className="popup-inline-close" type="button" aria-label="Fermer la fiche" title="Fermer" onClick={onPlaceCollapse}>
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      ref={(node) => {
                        if (node) refs.current.set(place.id, node);
                        else refs.current.delete(place.id);
                      }}
                       type="button"
                       draggable={tripPlaceDropEnabled || undefined}
                       data-place-row-focus
                      aria-expanded={inlineExpanded}
                      aria-label={place.name}
                      className="places-place-main"
                       onClick={() => {
                        if (mobileSwipeMoved.current) {
                          mobileSwipeMoved.current = false;
                          return;
                        }
                        if (inlineExpanded) onPlaceCollapse();
                         else onPlaceSelect(place);
                       }}
                       onDragStart={(event) => {
                         event.dataTransfer.effectAllowed = "copy";
                         event.dataTransfer.setData("text/plain", `place:${place.id}`);
                         event.dataTransfer.setData("application/x-cartavault-place", place.id);
                       }}
                    >
                      {!inlineExpanded && (
                        <span className="places-place-photo">
                          <PlaceListThumbnail photoId={place.primary_photo_id} statusColor={place.status.color} categoryIcon={primary?.icon} />
                        </span>
                      )}
                      <span className="places-place-copy">
                        <span className="places-place-title-row">
                          <strong title={place.name}>{place.name}</strong>
                        </span>
                        <span className="places-place-location">{formatLocation(place)}</span>
                        <span className="places-place-category">
                          {primary && (
                            <>
                              <CategoryIconPreview iconId={primary.icon} size={14} showLabel={false} />
                              <span className="places-place-category-name">{primary.name}</span>
                              <i aria-hidden="true">–</i>
                            </>
                          )}
                          <b className="places-place-status" style={{ color: place.status.color }}>
                            {place.status.name}
                          </b>
                          {place.tags.length > 0 && (
                            <>
                              <i aria-hidden="true">–</i>
                              <span className="places-place-tags">
                                {place.tags.map((tag) => (
                                  <span className="place-list-tag" key={tag.id} style={getTagColorStyle(tag.color)}>
                                    {tag.name}
                                  </span>
                                ))}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                    {!inlineExpanded && (
                      <aside className="places-place-actions" aria-label={`Actions pour ${place.name}`}>
                        <span className="places-place-rating" style={{ color: place.status.color }} aria-label={rating == null ? "Aucune note" : `Note ${rating}`}>
                          ★ {rating ?? "—"}
                        </span>
                        <button className={place.is_favorite ? "favorite active" : "favorite"} type="button" aria-label={place.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => void toggleFavorite(place)}>
                          <Heart size={20} fill={place.is_favorite ? "currentColor" : "none"} />
                        </button>
                      </aside>
                    )}
                  </div>
                  {inlineExpanded && (
                    <div className="place-inline-details" role="region" aria-label={`Détails de ${place.name}`}>
                      <PlaceMapPopup
                        placeId={place.id}
                        variant="inline"
                        initialPlace={place}
                        canEdit={poiMap?.can_edit !== false}
                        allowPhotoPaste={false}
                        showManagementActions={tripTargets.length === 0}
                        showHistoryAction={tripTargets.length === 0}
                        tripTargets={tripTargets}
                        onAddToTrip={(targetPlace, targetId) => {
                          if (targetId) return onAddToTripTarget?.(targetPlace, targetId);
                        }}
                        onUpdated={(updatedPlace) => {
                          setPlaces((current) => current.map((item) => item.id === updatedPlace.id ? updatedPlace : item));
                          setPinnedSelectedPlace((current) => current?.id === updatedPlace.id ? updatedPlace : current);
                          onBulkChanged();
                        }}
                        onEdit={() => navigate(withMap(`/places/${place.id}/edit`, poiMap?.id))}
                        onDeleted={(placeId) => {
                          setPlaces((current) => current.filter((item) => item.id !== placeId));
                          setPinnedSelectedPlace((current) => current?.id === placeId ? null : current);
                          onPlaceDeleted(placeId);
                          onBulkChanged();
                        }}
                        onClose={onPlaceCollapse}
                      />
                    </div>
                  )}
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
}
