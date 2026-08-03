import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { ApiError } from "./api/client";
import { deleteMap, getMaps } from "./api/maps";
import { getMapPlaces, getPlaceDetails } from "./api/places";
import { areMapPlacesEqual } from "./components/map/mapPlaceEquality";
import { getStatuses } from "./api/statuses";
import { addTripArrival, addTripDeparture, addTripNight, addTripStop, deleteTripArrival, deleteTripDeparture, getTrip, restoreTripState, setTripAnchorPlace, updateTripArrival, updateTripDeparture, updateTripNight } from "./api/trips";
import { TopBar } from "./components/layout/TopBar";
import {
  MainNavigation,
  type WorkspacePanel,
} from "./components/layout/MainNavigation";
import {
  buildMapOpeningFocusRequest,
  getMapOpeningConfigurationKey,
} from "./components/map/mapOpeningFocus";
import { MapSidebar } from "./components/sidebar/MapSidebar";
import { PlaceMapPopup } from "./components/map-popup/PlaceMapPopup";
import { TripStopMapPopup } from "./components/map-popup/TripStopMapPopup";
import { TripNightMapPopup } from "./components/map-popup/TripNightMapPopup";
import { TripAnchorMapPopup } from "./components/map-popup/TripAnchorMapPopup";
import {
  deriveMapSidebarState,
  getSidebarPlaceId,
} from "./components/sidebar/sidebarState";
import { InvitationPage } from "./pages/InvitationPage";
import type { PoiMap } from "./types/map";
import type {
  DraftPosition,
  MapBounds,
  MapFocusRequest,
  MapPlace,
  MapView,
  PlaceFilters,
  PlaceMutation,
  PreviewPlace,
} from "./types/place";
import type { PlaceStatusSummary } from "./types/status";
import type { Trip, TripNightTarget } from "./types/trip";
import type { GeocodingResult } from "./geocoding/types";
import { readMapId, readStatusId, withMap } from "./utils/map";
import {
  deserializePlaceFilters,
  serializePlaceFilters,
} from "./places/placeFilters";
import { getTripMapBounds } from "./components/trips/tripMapBounds";
import type { UnsavedTripSettingsGuard } from "./components/trips/TripPlannerPanel";
import { recordReversibleAction, WORKSPACE_CHANGED_EVENT } from "./ui/actionHistory";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import { useAuth } from "./auth/useAuth";
import { RegisterPage } from "./pages/RegisterPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from "./pages/PasswordResetPages";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { getSetupStatus, type SetupStatus } from "./api/setup";
import { useConfirmDialog } from "./components/common/useConfirmDialog";
import { ThemeProvider } from "./theme/ThemeProvider";
import { useI18n } from "./i18n/useI18n";

const MapsWorkspacePanel = lazy(async () => ({
  default: (await import("./components/maps/MapsWorkspacePanel"))
    .MapsWorkspacePanel,
}));
const MapMembersDialog = lazy(async () => ({
  default: (await import("./components/maps/MapMembersDialog"))
    .MapMembersDialog,
}));
const TripPlannerPanel = lazy(async () => ({
  default: (await import("./components/trips/TripPlannerPanel"))
    .TripPlannerPanel,
}));
const KmzExportDialog = lazy(async () => ({
  default: (await import("./components/exports/KmzExportDialog"))
    .KmzExportDialog,
}));
const MapPlaceList = lazy(async () => ({
  default: (await import("./components/place-list/MapPlaceList")).MapPlaceList,
}));
const MediaWorkspacePanel = lazy(async () => ({
  default: (await import("./components/media/MediaWorkspacePanel"))
    .MediaWorkspacePanel,
}));
const CategoriesWorkspacePanel = lazy(async () => ({
  default: (await import("./components/layout/WorkspaceManagementPanels"))
    .CategoriesWorkspacePanel,
}));
const TagsWorkspacePanel = lazy(async () => ({
  default: (await import("./components/layout/WorkspaceManagementPanels"))
    .TagsWorkspacePanel,
}));
const StatusesWorkspacePanel = lazy(async () => ({
  default: (await import("./components/layout/WorkspaceManagementPanels"))
    .StatusesWorkspacePanel,
}));
const TrashWorkspacePanel = lazy(async () => ({
  default: (await import("./components/trash/TrashWorkspacePanel"))
    .TrashWorkspacePanel,
}));
const AdminConsole = lazy(async () => ({
  default: (await import("./pages/admin/AdminConsole")).AdminConsole,
}));
const DashboardPage = lazy(async () => ({
  default: (await import("./components/dashboard/DashboardPage")).DashboardPage,
}));
const MapPage = lazy(async () => ({
  default: (await import("./pages/MapPage")).MapPage,
}));

const REQUEST_DEBOUNCE_MS = 250;
const MAP_ACCESS_REFRESH_MS = 30_000;
const INITIAL_MAP_VIEW: MapView = { center: [48.17, 6.45], zoom: 9 };
const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";
const mapAccessFingerprint = (maps: PoiMap[]) =>
  maps
    .map((item) =>
      [
        item.id,
        item.updated_at,
        getMapOpeningConfigurationKey(item),
        item.current_user_role,
        item.is_shared,
        item.can_edit,
        item.can_delete,
        item.can_manage_members,
        item.can_transfer_ownership,
        item.can_import,
        item.can_export,
      ].join(":"),
    )
    .join("|");

function WorkspaceApp() {
  const { confirm, confirmationDialog } = useConfirmDialog();
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardOpen = location.pathname === "/dashboard";
  const isMapWorkspace = !dashboardOpen;
  const adminOpen = location.pathname.startsWith("/admin");
  const workspacePathname = adminOpen ? "/" : location.pathname;
  const locationSearchRef = useRef(location.search);
  locationSearchRef.current = location.search;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const activeMapId = readMapId(location.search);
  const activeStatusId = readStatusId(location.search);
  const placeFilters = useMemo(() => {
    const search = new URLSearchParams(location.search);
    const filters = deserializePlaceFilters(search);
    if (!search.has("sort") && !search.has("direction")) {
      try {
        const stored = JSON.parse(window.localStorage.getItem("cartavault:place-sort") ?? "null") as Partial<PlaceFilters> | null;
        if (stored?.sortBy && stored.sortDirection && ["name", "created_at", "updated_at", "interest_rating", "visit_rating", "favorite", "relevant_rating", "status", "country", "city"].includes(stored.sortBy)) {
          filters.sortBy = stored.sortBy as PlaceFilters["sortBy"];
          filters.sortDirection = stored.sortDirection === "desc" ? "desc" : "asc";
        }
      } catch { /* Ignore malformed local preferences. */ }
    }
    if (activeStatusId && !filters.statusIds.includes(activeStatusId))
      filters.statusIds = [...filters.statusIds, activeStatusId];
    return filters;
  }, [activeStatusId, location.search]);
  const directPlaceId =
    location.pathname.match(/^\/places\/([^/]+)$/)?.[1] ?? null;
  const selectedRoutePlaceId = directPlaceId === "new" ? null : directPlaceId;
  const [maps, setMaps] = useState<PoiMap[]>([]);
  const activeMap = maps.find((item) => item.id === activeMapId) ?? null;
  const [statuses, setStatuses] = useState<PlaceStatusSummary[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PreviewPlace | MapPlace | null>(null);
  const [placeSelectionMode, setPlaceSelectionMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(
    null,
  );
  const [workspacePanel, setWorkspacePanel] =
    useState<WorkspacePanel>("places");
  const [placesPanelCollapsed, setPlacesPanelCollapsed] = useState(false);
  const [collapsedWorkspacePanel, setCollapsedWorkspacePanel] =
    useState<Exclude<WorkspacePanel, "places" | null> | null>(null);
  const restorePlacesPanelAfterEditor = useRef(false);
  const [removedPlaceId, setRemovedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    const refreshWorkspace = () => setRefreshVersion((value) => value + 1);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refreshWorkspace);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, refreshWorkspace);
  }, []);
  const requestSequence = useRef(0);
  const focusSequence = useRef(0);
  const focusedRoutePlaceId = useRef<string | null>(null);
  const suppressedRouteFocusPlaceId = useRef<string | null>(null);
  const mapZoom = useRef(mapView.zoom);
  mapZoom.current = mapView.zoom;
  const previousMapConfig = useRef<string | null | undefined>(undefined);
  const [temporarySearchResult, setTemporarySearchResult] =
    useState<GeocodingResult | null>(null);
  const [coordinatePrefill, setCoordinatePrefill] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [draftPosition, setDraftPosition] = useState<DraftPosition | null>(
    null,
  );
  const [exportMap, setExportMap] = useState<PoiMap | null>(null);
  const [membersMap, setMembersMap] = useState<PoiMap | null>(null);
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);
  const [tripPlannerCollapsed, setTripPlannerCollapsed] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [activeTripDayId, setActiveTripDayId] = useState<string | null>(null);
  const [activeTripNightTarget, setActiveTripNightTarget] =
    useState<TripNightTarget | null>(null);
  const [activeTripAnchorTarget, setActiveTripAnchorTarget] =
    useState<"departure" | "arrival" | null>(null);
  const activeTripAnchorTargetRef = useRef<"departure" | "arrival" | null>(null);
  const changeActiveTripAnchorTarget = useCallback((target: "departure" | "arrival" | null) => {
    activeTripAnchorTargetRef.current = target;
    setActiveTripAnchorTarget(target);
  }, []);
  const [tripViewOnly, setTripViewOnly] = useState(false);
  const [tripPreviewStopId, setTripPreviewStopId] = useState<string | null>(null);
  const [tripNightPopupId, setTripNightPopupId] = useState<string | null>(null);
  const [tripAnchorPopupTarget, setTripAnchorPopupTarget] =
    useState<"departure" | "arrival" | null>(null);
  const [tripPreviewSelectionKey, setTripPreviewSelectionKey] = useState<string | null>(null);
  const [hiddenTripDayIds, setHiddenTripDayIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tripNotice, setTripNotice] = useState<string | null>(null);
  const [createMapRequest, setCreateMapRequest] = useState(0);
  const [importRequest, setImportRequest] = useState(0);
  const [createTripRequest, setCreateTripRequest] = useState(0);
  const unsavedTripSettingsGuard = useRef<UnsavedTripSettingsGuard | null>(null);
  const tripAddPending = useRef(new Set<string>());
  const tripNoticeTimer = useRef<number | null>(null);
  const openAdmin = useCallback(
    () => navigate({ pathname: "/admin/users", search: location.search }),
    [location.search, navigate],
  );
  const openRegistrationRequests = useCallback(() => {
    const search = new URLSearchParams(location.search);
    search.set("admin_notification", "registration-requests");
    navigate({ pathname: "/admin/users", search: `?${search.toString()}` });
  }, [location.search, navigate]);
  const closeAdmin = useCallback(
    () => navigate({ pathname: "/", search: location.search }),
    [location.search, navigate],
  );

  useEffect(
    () => () => {
      if (tripNoticeTimer.current !== null)
        window.clearTimeout(tripNoticeTimer.current);
    },
    [],
  );
  useEffect(() => {
    setTripPreviewStopId(null);
    setTripPreviewSelectionKey(null);
  }, [activeTrip?.id]);

  const loadMaps = useCallback(
    (silent = false) => {
      const controller = new AbortController();
      if (!silent) {
        setMapsLoading(true);
        setMapsError(null);
      }
      void getMaps(controller.signal)
        .then((loaded) => {
          setMaps((current) =>
            mapAccessFingerprint(current) === mapAccessFingerprint(loaded)
              ? current
              : loaded,
          );
          const currentSearch = locationSearchRef.current;
          const requestedMapId = readMapId(currentSearch);
          if (requestedMapId === null && loaded.length > 0) {
            navigateRef.current(
              withMap(
                workspacePathname,
                loaded[0].id,
                readStatusId(currentSearch),
              ),
              { replace: true },
            );
          } else if (
            requestedMapId !== null &&
            !loaded.some((item) => item.id === requestedMapId)
          ) {
            navigateRef.current(
              withMap("/", loaded[0]?.id ?? null, readStatusId(currentSearch)),
              { replace: true },
            );
          }
        })
        .catch((error: unknown) => {
          if (!silent && !isAbortError(error)) {
            setMapsError(
              error instanceof Error
                ? error.message
                : "Impossible de charger les cartes.",
            );
          }
        })
        .finally(() => {
          if (!silent && !controller.signal.aborted) setMapsLoading(false);
        });
      return () => controller.abort();
    },
    [workspacePathname],
  );
  useEffect(() => {
    const abort = loadMaps();
    const refreshVisibleAccess = () => {
      if (document.visibilityState === "visible") loadMaps(true);
    };
    const interval = window.setInterval(
      refreshVisibleAccess,
      MAP_ACCESS_REFRESH_MS,
    );
    window.addEventListener("focus", refreshVisibleAccess);
    document.addEventListener("visibilitychange", refreshVisibleAccess);
    return () => {
      abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleAccess);
      document.removeEventListener("visibilitychange", refreshVisibleAccess);
    };
  }, [loadMaps, isMapWorkspace, refreshVersion]);

  useEffect(() => {
    if (!isMapWorkspace || !activeMapId) {
      setStatuses([]);
      return;
    }
    const controller = new AbortController();
    void getStatuses(activeMapId, controller.signal, { activeOnly: true })
      .then(setStatuses)
      .catch((error: unknown) => {
        if (!isAbortError(error))
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Impossible de charger les statuts.",
          );
      });
    return () => controller.abort();
  }, [activeMapId, isMapWorkspace, refreshVersion]);

  useEffect(() => {
    const configKey =
      activeMap === null ? null : getMapOpeningConfigurationKey(activeMap);
    if (previousMapConfig.current === configKey) return;
    previousMapConfig.current = configKey;
    focusedRoutePlaceId.current = null;
    suppressedRouteFocusPlaceId.current = null;
    setSelectedPlace(null);
    setPlaces([]);
    setBounds(null);
    setRemovedPlaceId(null);
    if (activeMap) {
      setFocusRequest(
        buildMapOpeningFocusRequest(activeMap, ++focusSequence.current),
      );
    }
  }, [activeMapId, activeMap]);

  useEffect(() => {
    if (!isMapWorkspace || bounds === null || activeMapId === null) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const visible = await getMapPlaces(
          { bounds, mapId: activeMapId, filters: placeFilters, limit: 2000 },
          controller.signal,
        );
        if (sequence === requestSequence.current) {
          setPlaces((current) =>
            areMapPlacesEqual(current, visible.items) ? current : visible.items,
          );
          setErrorMessage(
            visible.truncated
              ? "Trop de lieux sont visibles. Zoomez pour affiner l’affichage."
              : null,
          );
          setSelectedPlace((current) =>
            current === null
              ? null
              : (visible.items.find((item) => item.id === current.id) ??
                current),
          );
        }
      } catch (error) {
        if (!isAbortError(error) && sequence === requestSequence.current) {
          if (error instanceof ApiError && error.status === 404) {
            setPlaces([]);
            setSelectedPlace(null);
            loadMaps(true);
          } else {
            setErrorMessage(
              error instanceof Error ? error.message : "Chargement impossible.",
            );
          }
        }
      } finally {
        if (sequence === requestSequence.current) setIsLoading(false);
      }
    }, REQUEST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    activeMapId,
    bounds,
    isMapWorkspace,
    loadMaps,
    placeFilters,
    refreshVersion,
  ]);

  useEffect(() => {
    if (selectedRoutePlaceId === null) {
      focusedRoutePlaceId.current = null;
      return;
    }
    const visiblePlace = places.find((place) => place.id === selectedRoutePlaceId);
    if (visiblePlace) {
      setSelectedPlace((current) => current?.id === visiblePlace.id ? current : visiblePlace);
      if (suppressedRouteFocusPlaceId.current === selectedRoutePlaceId) {
        suppressedRouteFocusPlaceId.current = null;
        focusedRoutePlaceId.current = selectedRoutePlaceId;
      } else if (focusedRoutePlaceId.current !== selectedRoutePlaceId) {
        focusedRoutePlaceId.current = selectedRoutePlaceId;
        setFocusRequest({
          id: ++focusSequence.current,
          view: {
            center: [visiblePlace.latitude, visiblePlace.longitude],
            zoom: Math.max(mapZoom.current, 13),
          },
        });
      }
      return;
    }
    const controller = new AbortController();
    void getPlaceDetails(selectedRoutePlaceId, controller.signal)
      .then((place) => {
        if (controller.signal.aborted) return;
        if (place.latitude === null || place.longitude === null) return;
        const marker: MapPlace = {
          id: place.id,
          map_id: place.map_id,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          status: { id: place.status.id, color: place.status.color },
          primary_category_icon:
            place.categories.find((category) => category.is_primary)?.icon ?? null,
          category_ids: place.categories.map((category) => category.id),
          tag_ids: place.tags.map((tag) => tag.id),
          is_favorite: place.is_favorite === true,
        };
        setPlaces((current) =>
          current.some((item) => item.id === marker.id)
            ? current
            : [...current, marker],
        );
        setSelectedPlace(marker);
        if (suppressedRouteFocusPlaceId.current === selectedRoutePlaceId) {
          suppressedRouteFocusPlaceId.current = null;
          focusedRoutePlaceId.current = selectedRoutePlaceId;
        } else if (focusedRoutePlaceId.current !== selectedRoutePlaceId) {
          focusedRoutePlaceId.current = selectedRoutePlaceId;
          setFocusRequest({
            id: ++focusSequence.current,
            view: {
              center: [marker.latitude, marker.longitude],
              zoom: Math.max(mapZoom.current, 13),
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (!isAbortError(error))
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Impossible de charger le POI demandé.",
          );
      });
    return () => controller.abort();
  }, [places, selectedRoutePlaceId]);

  const handleMutation = (mutation: PlaceMutation) => {
    setCoordinatePrefill(null);
    setDraftPosition(null);
    setSelectedPlace(null);
    setRemovedPlaceId(null);
    setRefreshVersion((value) => value + 1);
    if (activeTrip !== null) {
      const tripId = activeTrip.id;
      void getTrip(tripId)
        .then((loaded) =>
          setActiveTrip((current) => (current?.id === tripId ? loaded : current)),
        )
        .catch((error: unknown) =>
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "La sortie active n’a pas pu être actualisée.",
          ),
        );
    }
    if (mutation.mapId !== activeMapId)
      navigate(withMap("/", mutation.mapId, activeStatusId));
  };
  const handleDeletePlace = (id: string) => {
    setPlaces((current) => current.filter((place) => place.id !== id));
    setSelectedPlace((current) => (current?.id === id ? null : current));
    setRemovedPlaceId(id);
    setRefreshVersion((value) => value + 1);
  };
  const handleSelect = (place: PreviewPlace | MapPlace, revealClusteredPlace = false, focusPlace = true) => {
    setSelectedPlace(place);
    setWorkspacePanel(tripViewOnly ? null : "places");
    suppressedRouteFocusPlaceId.current = focusPlace ? null : place.id;
    navigate(withMap(`/places/${place.id}`, activeMapId, activeStatusId));
    if (focusPlace && place.latitude !== null && place.longitude !== null) {
      focusedRoutePlaceId.current = place.id;
      setFocusRequest({
        id: ++focusSequence.current,
        view: {
          center: [place.latitude, place.longitude],
          zoom: revealClusteredPlace ? 19 : Math.max(mapView.zoom, 13),
        },
        centerInVisibleWorkspace: tripPlannerOpen,
      });
    }
  };
  const showTripNotice = (message: string) => {
    setTripNotice(message);
    if (tripNoticeTimer.current !== null)
      window.clearTimeout(tripNoticeTimer.current);
    tripNoticeTimer.current = window.setTimeout(
      () => setTripNotice(null),
      2600,
    );
  };
  const replaceActiveTripAnchorWithPlace = async (
    target: "departure" | "arrival",
    placeId: string,
  ) => {
    if (!activeTrip || activeMap?.can_edit !== true) return;
    const key = `anchor:${target}:${placeId}`;
    if (tripAddPending.current.has(key)) return;
    tripAddPending.current.add(key);
    try {
      const before = await getTrip(activeTrip.id);
      let loaded: Trip;
      try {
        loaded = await setTripAnchorPlace(activeTrip.id, target, placeId);
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status !== 404) throw caught;
        if (target === "departure") {
          const payload = { place_id: placeId, notes: before.departure?.notes ?? null, departure_time: before.departure?.departure_time ?? null };
          const saved = before.departure
            ? await updateTripDeparture(before.departure.id, payload)
            : await addTripDeparture(activeTrip.id, payload);
          loaded = { ...before, departure: saved };
        } else {
          const payload = { place_id: placeId, notes: before.arrival?.notes ?? null };
          const saved = before.arrival
            ? await updateTripArrival(before.arrival.id, payload)
            : await addTripArrival(activeTrip.id, payload);
          loaded = { ...before, arrival: saved };
        }
      }
      const savedAnchor = target === "departure" ? loaded.departure : loaded.arrival;
      if (savedAnchor?.place_id !== placeId) throw new Error("Le serveur n’a pas associé le POI demandé.");
      setActiveTrip(loaded);
      const restore = async (state: Trip) => { const restored = await restoreTripState(activeTrip.id, state); setActiveTrip(restored); };
      recordReversibleAction({
        label: target === "departure" ? "remplacement du point de départ" : "remplacement du point d’arrivée",
        undo: () => restore(before),
        redo: () => restore(loaded),
      });
      showTripNotice(`${savedAnchor.name} associé ${target === "departure" ? "au départ" : "à l’arrivée"}.`);
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : "Impossible de remplacer ce point.");
    } finally {
      tripAddPending.current.delete(key);
    }
  };
  const addPlaceToActiveTripTarget = async (
    place: PreviewPlace,
    requestedDayId?: string,
  ) => {
    if (!tripPlannerOpen || activeMap?.can_edit !== true) return;
    if (!activeTrip) {
      showTripNotice("Créez ou sélectionnez une sortie.");
      return;
    }
    if (activeTrip.status === "completed" || activeTrip.status === "archived")
      return;
    const anchorTarget = activeTripAnchorTargetRef.current;
    if (anchorTarget) {
      await replaceActiveTripAnchorWithPlace(anchorTarget, place.id);
      return;
    }
    const targetDayId = requestedDayId ?? activeTripDayId;
    if (!activeTripNightTarget && (
      !targetDayId ||
      !activeTrip.days.some((day) => day.id === targetDayId)
    )) {
      showTripNotice("Sélectionnez une journée.");
      return;
    }
    const key = activeTripNightTarget
      ? `night:${activeTripNightTarget.previousDayId}:${activeTripNightTarget.nextDayId}:${place.id}`
      : `day:${targetDayId}:${place.id}`;
    if (tripAddPending.current.has(key)) return;
    tripAddPending.current.add(key);
    try {
      const before = await getTrip(activeTrip.id);
      if (activeTripNightTarget) {
        const createdNight = activeTripNightTarget.nightId
          ? await updateTripNight(activeTripNightTarget.nightId, { place_id: place.id, source_type: "place" })
          : await addTripNight(activeTrip.id, {
              previous_day_id: activeTripNightTarget.previousDayId,
              next_day_id: activeTripNightTarget.nextDayId,
              place_id: place.id,
              source_type: "place",
            });
        setActiveTripNightTarget({
          ...activeTripNightTarget,
          nightId: createdNight.id,
        });
      } else {
        await addTripStop(targetDayId!, {
          place_id: place.id,
          stop_type: "place",
        });
      }
      const loaded = await getTrip(activeTrip.id);
      setActiveTrip(loaded);
      const restore = async (state: Trip) => { const restored = await restoreTripState(activeTrip.id, state); setActiveTrip(restored); };
      recordReversibleAction({ label: activeTripNightTarget ? `ajout du POI « ${place.name} » à la nuit` : `ajout du POI « ${place.name} » à la journée`, undo: () => restore(before), redo: () => restore(loaded) });
      const day = loaded.days.find((item) => item.id === targetDayId);
      if (!activeTripNightTarget) setActiveTripDayId(targetDayId);
      showTripNotice(
        activeTripNightTarget
          ? `${place.name} ajouté à la nuit sélectionnée.`
          : `${place.name} ajouté${day ? ` au jour ${day.day_number}` : ""}.`,
      );
    } catch (caught) {
      showTripNotice(
        caught instanceof Error
          ? caught.message
          : "Impossible d’ajouter ce POI.",
      );
    } finally {
      tripAddPending.current.delete(key);
    }
  };
  const addGeographicResultToActiveTripTarget = async (result: GeocodingResult) => {
    if (!tripPlannerOpen || activeMap?.can_edit !== true) return;
    if (!activeTrip) {
      showTripNotice("Créez ou sélectionnez une sortie.");
      return;
    }
    if (activeTrip.status === "completed" || activeTrip.status === "archived") return;
    const targetDayId = activeTripDayId;
    const anchorTarget = activeTripAnchorTargetRef.current;
    if (!anchorTarget && !activeTripNightTarget && (!targetDayId || !activeTrip.days.some((day) => day.id === targetDayId))) {
      showTripNotice("Sélectionnez un jour, une nuit, le départ ou l’arrivée.");
      return;
    }
    const targetKey = anchorTarget ?? (activeTripNightTarget
      ? `night:${activeTripNightTarget.previousDayId}:${activeTripNightTarget.nextDayId}`
      : `day:${targetDayId}`);
    const key = `geographic:${targetKey}:${result.id}`;
    if (tripAddPending.current.has(key)) return;
    tripAddPending.current.add(key);
    try {
      const before = await getTrip(activeTrip.id);
      const locationPayload = {
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        address: result.formattedAddress,
      };
      let savedDeparture = null;
      let savedArrival = null;
      if (anchorTarget === "departure") {
        const payload = {
          ...locationPayload,
          place_id: null,
          notes: before.departure?.notes ?? null,
          departure_time: before.departure?.departure_time ?? null,
        };
        savedDeparture = before.departure
          ? await updateTripDeparture(before.departure.id, payload)
          : await addTripDeparture(activeTrip.id, payload);
      } else if (anchorTarget === "arrival") {
        const payload = { ...locationPayload, place_id: null, notes: before.arrival?.notes ?? null };
        savedArrival = before.arrival
          ? await updateTripArrival(before.arrival.id, payload)
          : await addTripArrival(activeTrip.id, payload);
      } else if (activeTripNightTarget) {
        const payload = {
          place_id: null,
          source_type: "map" as const,
          ...locationPayload,
          google_place_id: result.source === "google_places" && result.id.startsWith("google:")
            ? result.id.slice("google:".length)
            : null,
        };
        const savedNight = activeTripNightTarget.nightId
          ? await updateTripNight(activeTripNightTarget.nightId, payload)
          : await addTripNight(activeTrip.id, {
              previous_day_id: activeTripNightTarget.previousDayId,
              next_day_id: activeTripNightTarget.nextDayId,
              ...payload,
            });
        setActiveTripNightTarget({ ...activeTripNightTarget, nightId: savedNight.id });
      } else if (targetDayId) {
        await addTripStop(targetDayId, {
          stop_type: "free_location",
          name: result.name,
          latitude: result.latitude,
          longitude: result.longitude,
          address: result.formattedAddress,
          visit_duration_minutes: 30,
        });
        setActiveTripDayId(targetDayId);
      }
      const refreshed = await getTrip(activeTrip.id);
      const loaded: Trip = anchorTarget === "departure" && savedDeparture
        ? { ...refreshed, departure: savedDeparture }
        : anchorTarget === "arrival" && savedArrival
          ? { ...refreshed, arrival: savedArrival }
          : refreshed;
      setActiveTrip(loaded);
      const restore = async (state: Trip) => { const restored = await restoreTripState(activeTrip.id, state); setActiveTrip(restored); };
      recordReversibleAction({
        label: anchorTarget
          ? `association de « ${result.name} » ${anchorTarget === "departure" ? "au départ" : "à l’arrivée"}`
          : activeTripNightTarget ? `association de « ${result.name} » à la nuit` : `ajout de « ${result.name} » à la journée`,
        undo: () => restore(before),
        redo: () => restore(loaded),
      });
      const targetDay = loaded.days.find((day) => day.id === (activeTripNightTarget?.previousDayId ?? targetDayId));
      showTripNotice(anchorTarget
        ? `${result.name} associé ${anchorTarget === "departure" ? "au départ" : "à l’arrivée"}.`
        : activeTripNightTarget
          ? `${result.name} associé à la nuit ${targetDay?.day_number ?? "sélectionnée"}.`
          : `${result.name} ajouté${targetDay ? ` au jour ${targetDay.day_number}` : ""}.`);
      setTemporarySearchResult(null);
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : "Impossible d’ajouter ce lieu à la sortie.");
    } finally {
      tripAddPending.current.delete(key);
    }
  };
  const addCoordinatesToTripDay = async (
    dayId: string,
    latitude: number,
    longitude: number,
  ) => {
    if (
      !activeTrip ||
      activeMap?.can_edit !== true ||
      !activeTrip.days.some((day) => day.id === dayId)
    )
      return;
    try {
      const before = await getTrip(activeTrip.id);
      await addTripStop(dayId, {
        stop_type: "free_location",
        name: `Point ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        latitude,
        longitude,
      });
      const loaded = await getTrip(activeTrip.id);
      setActiveTrip(loaded);
      const restore = async (state: Trip) => { const restored = await restoreTripState(activeTrip.id, state); setActiveTrip(restored); };
      recordReversibleAction({ label: 'ajout d’un emplacement à la journée', undo: () => restore(before), redo: () => restore(loaded) });
      setActiveTripDayId(dayId);
      const day = loaded.days.find((item) => item.id === dayId);
      showTripNotice(
        `Emplacement ajouté${day ? ` au jour ${day.day_number}` : ""}.`,
      );
    } catch (caught) {
      showTripNotice(
        caught instanceof Error
          ? caught.message
          : "Impossible d’ajouter cet emplacement.",
      );
    }
  };
  const deleteWorkspaceMap = async (poiMap: PoiMap) => {
    if (
      !(await confirm({
        title: "Placer cette carte dans la corbeille ?",
        message: `La carte « ${poiMap.name} » et son contenu ne seront plus accessibles, mais pourront être restaurés pendant votre délai de conservation.`,
      }))
    )
      return;
    try {
      await deleteMap(poiMap.id);
      const remaining = maps.filter((item) => item.id !== poiMap.id);
      setMaps(remaining);
      if (poiMap.id === activeMapId)
        navigate(withMap("/", remaining[0]?.id ?? null, activeStatusId));
    } catch (error) {
      setMapsError(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    }
  };
  const sidebarState = deriveMapSidebarState(
    location.pathname,
    selectedRoutePlaceId === null ? null : selectedPlace,
  );
  const selectedPlaceId = getSidebarPlaceId(sidebarState);
  const editorOpen =
    sidebarState.mode === "create" || sidebarState.mode === "edit";
  useEffect(() => {
    if (editorOpen) {
      if (workspacePanel === "places") {
        restorePlacesPanelAfterEditor.current = true;
        setPlacesPanelCollapsed(true);
      }
      return;
    }

    if (restorePlacesPanelAfterEditor.current) {
      restorePlacesPanelAfterEditor.current = false;
      if (workspacePanel === "places") setPlacesPanelCollapsed(false);
    }
  }, [editorOpen, workspacePanel]);
  useEffect(() => {
    if (editorOpen && activeMap !== null && activeMap.can_edit !== true) {
      navigate(
        withMap(
          sidebarState.mode === "edit"
            ? `/places/${sidebarState.placeId}`
            : "/",
          activeMapId,
          activeStatusId,
        ),
        { replace: true },
      );
    }
  }, [
    activeMap,
    activeMapId,
    activeStatusId,
    editorOpen,
    navigate,
    sidebarState,
  ]);
  useEffect(() => {
    if (!editorOpen) setDraftPosition(null);
  }, [editorOpen, location.pathname]);
  useEffect(() => {
    setActiveTrip(null);
    setActiveTripDayId(null);
    setActiveTripNightTarget(null);
    changeActiveTripAnchorTarget(null);
    setTripNightPopupId(null);
    setTripAnchorPopupTarget(null);
    setTripPlannerCollapsed(false);
    setPlaceSelectionMode(false);
    setSelectedPlaceIds(new Set());
  }, [activeMapId, changeActiveTripAnchorTarget]);
  useEffect(() => {
    if (
      sidebarState.mode === "create" &&
      draftPosition === null &&
      coordinatePrefill === null &&
      temporarySearchResult === null
    )
      setDraftPosition({
        latitude: mapView.center[0],
        longitude: mapView.center[1],
      });
  }, [
    coordinatePrefill,
    draftPosition,
    mapView.center,
    sidebarState.mode,
    temporarySearchResult,
  ]);
  const closePopup = () => {
    if (sidebarState.mode === "details" || sidebarState.mode === "preview") {
      setSelectedPlace(null);
      navigate(withMap("/", activeMapId, activeStatusId));
    }
  };
  const openWorkspacePanel = (panel: WorkspacePanel) => {
    setWorkspacePanel(panel);
    if (panel !== null && panel !== "places") setCollapsedWorkspacePanel(null);
    if (panel === null) return;
    const panelId =
      panel === "places" ? "map-place-list" : `workspace-${panel}-panel`;
    window.setTimeout(() => document.getElementById(panelId)?.focus(), 0);
  };
  const activeTripAddTargetLabel =
    tripPlannerOpen &&
    activeMap?.can_edit === true &&
    activeTrip !== null &&
    activeTrip.status !== "completed" &&
    activeTrip.status !== "archived"
      ? activeTripNightTarget === null
        ? activeTrip.days.find((day) => day.id === activeTripDayId)?.day_number
          ? `Ajouter au jour ${activeTrip.days.find((day) => day.id === activeTripDayId)?.day_number}`
          : null
        : `Ajouter à la nuit ${activeTrip.days.find((day) => day.id === activeTripNightTarget.previousDayId)?.day_number ?? "sélectionnée"}`
      : null;
  const activeTripGeographicTargetLabel =
    tripPlannerOpen && activeMap?.can_edit === true && activeTrip !== null && activeTrip.status !== "completed" && activeTrip.status !== "archived"
      ? activeTripAnchorTarget === "departure"
        ? "Ajouter au départ"
        : activeTripAnchorTarget === "arrival"
          ? "Ajouter à l’arrivée"
          : activeTripAddTargetLabel
      : null;
  const activeTripPlaceIds = useMemo(
    () =>
      new Set(
        [
          ...(activeTrip?.days.flatMap((day) =>
            day.stops.map((stop) => stop.place_id),
          ) ?? []),
          ...(activeTrip?.nights.map((night) => night.place_id) ?? []),
          activeTrip?.departure?.place_id ?? null,
          activeTrip?.arrival?.place_id ?? null,
        ].filter((id): id is string => id !== null),
      ),
    [activeTrip],
  );
  const activeTripTargetPlaceId = activeTripAnchorTarget === "departure"
    ? activeTrip?.departure?.place_id ?? null
    : activeTripAnchorTarget === "arrival"
      ? activeTrip?.arrival?.place_id ?? null
      : activeTripNightTarget?.nightId
        ? activeTrip?.nights.find((night) => night.id === activeTripNightTarget.nightId)?.place_id ?? null
        : null;
  const popupTripAddTargetLabel =
    selectedPlaceId !== null && selectedPlaceId !== activeTripTargetPlaceId
      ? activeTripGeographicTargetLabel
      : null;
  const selectedPreviewStop = activeTrip?.days.flatMap((day) => day.stops).find((stop) => stop.id === tripPreviewStopId) ?? null;
  const selectedTripNight = activeTrip?.nights.find((night) => night.id === tripNightPopupId) ?? null;
  const selectedTripAnchor = tripAnchorPopupTarget === "departure"
    ? activeTrip?.departure ?? null
    : tripAnchorPopupTarget === "arrival"
      ? activeTrip?.arrival ?? null
      : null;
  const deleteSelectedTripAnchor = async () => {
    if (!activeTrip || !selectedTripAnchor || !tripAnchorPopupTarget) return;
    try {
      const before = await getTrip(activeTrip.id);
      if (tripAnchorPopupTarget === "departure") await deleteTripDeparture(selectedTripAnchor.id);
      else await deleteTripArrival(selectedTripAnchor.id);
      const after = await getTrip(activeTrip.id);
      setActiveTrip(after);
      setTripAnchorPopupTarget(null);
      const restore = async (state: Trip) => {
        await restoreTripState(activeTrip.id, state);
        setActiveTrip(await getTrip(activeTrip.id));
      };
      recordReversibleAction({
        label: tripAnchorPopupTarget === "departure" ? "suppression du point de départ" : "suppression du point d’arrivée",
        undo: () => restore(before),
        redo: () => restore(after),
      });
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : "Impossible de supprimer ce point.");
    }
  };
  const popupContent =
    selectedTripAnchor !== null && tripAnchorPopupTarget !== null ? (
      <TripAnchorMapPopup
        anchor={selectedTripAnchor}
        kind={tripAnchorPopupTarget}
        canEdit={activeMap?.can_edit === true}
        onDelete={() => void deleteSelectedTripAnchor()}
        onClose={() => setTripAnchorPopupTarget(null)}
      />
    ) : selectedTripNight !== null ? (
      <TripNightMapPopup
        night={selectedTripNight}
        canEdit={activeMap?.can_edit === true}
        onUpdated={(updated) => setActiveTrip((current) => current === null ? null : ({ ...current, nights: current.nights.map((night) => night.id === updated.id ? updated : night) }))}
        onClose={() => setTripNightPopupId(null)}
      />
    ) : selectedPlaceId !== null && !editorOpen ? (
      <PlaceMapPopup
        placeId={selectedPlaceId}
        canEdit={activeMap?.can_edit === true}
        showManagementActions={!tripPlannerOpen}
        tripAddTargetLabel={popupTripAddTargetLabel}
        tripDays={
          tripPlannerOpen &&
          activeMap?.can_edit === true &&
          activeTrip !== null &&
          activeTripDayId === null &&
          activeTripNightTarget === null &&
          activeTripAnchorTarget === null
            ? activeTrip.days.map((day) => ({
                id: day.id,
                label: `Jour ${day.day_number}${day.title ? ` · ${day.title}` : ""}`,
              }))
            : []
        }
        onAddToTrip={addPlaceToActiveTripTarget}
        onEdit={() =>
          navigate(
            withMap(
              `/places/${selectedPlaceId}/edit`,
              activeMapId,
              activeStatusId,
            ),
          )
        }
        onDeleted={(id) => {
          handleDeletePlace(id);
          navigate(withMap("/", activeMapId, activeStatusId));
        }}
        onClose={closePopup}
      />
    ) : tripViewOnly && selectedPreviewStop && selectedPreviewStop.place_id === null ? (
      <TripStopMapPopup stop={selectedPreviewStop} onClose={() => setTripPreviewStopId(null)} />
    ) : null;
  const workspaceContent = (
    <Suspense
      fallback={
        <aside className="cv-workspace-panel" role="status">
          Chargement du panneauâ€¦
        </aside>
      }
    >
      {workspacePanel === "maps" ? (
        <MapsWorkspacePanel
          maps={maps}
          activeMapId={activeMapId}
          isLoading={mapsLoading}
          errorMessage={mapsError}
          onOpen={(mapId) => {
            navigate(withMap("/", mapId, activeStatusId));
            setWorkspacePanel("places");
          }}
          onDelete={(poiMap) => void deleteWorkspaceMap(poiMap)}
          onCreated={(poiMap) => {
            setMaps((current) => [...current, poiMap]);
            navigate(withMap("/", poiMap.id, activeStatusId));
            setWorkspacePanel("places");
          }}
          onExport={setExportMap}
          onMembers={setMembersMap}
          onAccessChanged={() => setRefreshVersion((value) => value + 1)}
          collapsed={collapsedWorkspacePanel === "maps"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "maps" : null)
          }
          createRequest={createMapRequest}
        />
      ) : workspacePanel === "places" ? (
        <MapPlaceList
          poiMap={activeMap}
          statuses={statuses}
          filters={placeFilters}
          selectedPlaceId={selectedPlaceId}
          refreshVersion={refreshVersion}
          removedPlaceId={removedPlaceId}
          collapsed={placesPanelCollapsed}
          onCollapsedChange={setPlacesPanelCollapsed}
          onFiltersChange={(filters: PlaceFilters) => {
            window.localStorage.setItem("cartavault:place-sort", JSON.stringify({ sortBy: filters.sortBy, sortDirection: filters.sortDirection }));
            const params = serializePlaceFilters(filters);
            if (activeMapId) params.set("map", activeMapId);
            navigate({
              pathname: location.pathname,
              search: params.toString() ? `?${params}` : "",
            });
          }}
          onPlaceSelect={(place) => handleSelect(place, true)}
          onImported={() => setRefreshVersion((value) => value + 1)}
          onBulkChanged={() => setRefreshVersion((value) => value + 1)}
          onBulkTripChanged={(tripId) => {
            if (activeTrip?.id === tripId)
              void getTrip(tripId)
                .then(setActiveTrip)
                .catch((caught: unknown) =>
                  showTripNotice(
                    caught instanceof Error
                      ? caught.message
                      : "Impossible de rafraîchir la sortie.",
                  ),
                );
          }}
          selectionMode={placeSelectionMode}
          selectedPlaceIds={selectedPlaceIds}
          onSelectionModeChange={setPlaceSelectionMode}
          onSelectedPlaceIdsChange={setSelectedPlaceIds}
          tripPlanningActive={tripPlannerOpen}
          tripPlaceIds={activeTripPlaceIds}
          tripAddTargetLabel={activeTripAddTargetLabel}
          onTripPlaceAdd={(place) => void addPlaceToActiveTripTarget(place)}
          importRequest={importRequest}
        />
      ) : workspacePanel === "media" ? (
        <MediaWorkspacePanel
          collapsed={collapsedWorkspacePanel === "media"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "media" : null)
          }
          onOpenPlace={(media) => {
            setWorkspacePanel("places");
            navigate(withMap(`/places/${media.place.id}`, media.map.id, null));
          }}
        />
      ) : workspacePanel === "categories" && activeMapId !== null ? (
        <CategoriesWorkspacePanel
          mapId={activeMapId}
          canEdit={activeMap?.can_edit === true}
          collapsed={collapsedWorkspacePanel === "categories"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "categories" : null)
          }
        />
      ) : workspacePanel === "tags" && activeMapId !== null ? (
        <TagsWorkspacePanel
          mapId={activeMapId}
          canEdit={activeMap?.can_edit === true}
          collapsed={collapsedWorkspacePanel === "tags"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "tags" : null)
          }
        />
      ) : workspacePanel === "statuses" ? (
        <StatusesWorkspacePanel
          mapId={activeMapId ?? undefined}
          canEdit={activeMap?.can_edit === true}
          collapsed={collapsedWorkspacePanel === "statuses"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "statuses" : null)
          }
        />
      ) : workspacePanel === "trash" ? (
        <TrashWorkspacePanel
          collapsed={collapsedWorkspacePanel === "trash"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "trash" : null)
          }
          onChanged={() => {
            void loadMaps(true);
            setRefreshVersion((value) => value + 1);
          }}
        />
      ) : null}
    </Suspense>
  );

  const handleTripStopFocus = (latitude: number, longitude: number) => {
    setFocusRequest({
      id: ++focusSequence.current,
      view: { center: [latitude, longitude], zoom: Math.max(mapView.zoom, 15) },
    });
  };
  const handleTripPlaceSelect = async (placeId: string, focusPlace = true) => {
    const visiblePlace = places.find((item) => item.id === placeId);
    if (visiblePlace) {
      handleSelect(visiblePlace, false, focusPlace);
      return;
    }
    try {
      const controller = new AbortController();
      const place = await getPlaceDetails(placeId, controller.signal);
      if (place.latitude === null || place.longitude === null) {
        showTripNotice("Ce lieu ne possède pas de coordonnées exploitables.");
        return;
      }
      const marker: MapPlace = {
        id: place.id,
        map_id: place.map_id,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        status: { id: place.status.id, color: place.status.color },
        primary_category_icon:
          place.categories.find((category) => category.is_primary)?.icon ?? null,
        category_ids: place.categories.map((category) => category.id),
        tag_ids: place.tags.map((tag) => tag.id),
        is_favorite: place.is_favorite === true,
      };
      setPlaces((current) =>
        current.some((item) => item.id === marker.id)
          ? current
          : [...current, marker],
      );
      handleSelect(marker, false, focusPlace);
    } catch (caught) {
      showTripNotice(
        caught instanceof Error
          ? caught.message
          : "Impossible d’ouvrir ce lieu.",
      );
    }
  };
  const rightSidebar =
    tripPlannerOpen && activeMap ? (
      <Suspense
        fallback={
          <aside
            className={`map-sidebar trip-planner-panel trip-planner-panel--loading${tripPlannerCollapsed ? " is-collapsed" : ""}`}
            role="status"
          >
            Chargement de la préparation de sortieâ€¦
          </aside>
        }
      >
        <TripPlannerPanel
          poiMap={activeMap}
          trip={activeTrip}
          activeDayId={activeTripDayId}
          tripViewOnly={tripViewOnly}
          hiddenDayIds={hiddenTripDayIds}
          collapsed={tripPlannerCollapsed}
          createRequest={createTripRequest}
          onCollapsedChange={setTripPlannerCollapsed}
          onTripViewOnlyChange={(enabled) => {
            if (enabled) closePopup();
            setTripPreviewStopId(null);
            if (!enabled) setTripPreviewSelectionKey(null);
            setTripViewOnly(enabled);
            setTripPlannerCollapsed(false);
            setWorkspacePanel(enabled ? null : "places");
            if (enabled) {
              const tripBounds = getTripMapBounds(activeTrip);
              if (tripBounds)
                setFocusRequest({
                  id: ++focusSequence.current,
                  bounds: tripBounds,
                  maxZoom: 15,
                });
            }
          }}
          onDayVisibilityChange={(dayId, visible) =>
            setHiddenTripDayIds((current) => {
              const next = new Set(current);
              if (visible) next.delete(dayId);
              else next.add(dayId);
              return next;
            })
          }
          onTripChange={setActiveTrip}
          onActiveDayChange={setActiveTripDayId}
          activeAnchorTarget={activeTripAnchorTarget}
          onActiveAnchorTargetChange={changeActiveTripAnchorTarget}
          onActiveNightTargetChange={(target, openPopup = false) => {
            setActiveTripNightTarget(target);
            if (target) changeActiveTripAnchorTarget(null);
            if (openPopup) setTripAnchorPopupTarget(null);
            setTripNightPopupId(openPopup ? target?.nightId ?? null : null);
            if (openPopup && target?.nightId) closePopup();
          }}
          onAnchorPopupChange={(target) => {
            setTripAnchorPopupTarget(target);
            if (target) {
              setTripNightPopupId(null);
              closePopup();
            }
          }}
          onAnchorPlaceDrop={(target, placeId) => replaceActiveTripAnchorWithPlace(target, placeId)}
          onStopFocus={handleTripStopFocus}
          onStopPlaceSelect={(placeId) => {
            setTripAnchorPopupTarget(null);
            void handleTripPlaceSelect(placeId, !tripViewOnly);
          }}
          onPreviewStopSelect={(stopId) => {
            setTripPreviewStopId(stopId);
            const stop = activeTrip?.days.flatMap((day) => day.stops).find((item) => item.id === stopId) ?? null;
            if (stop?.place_id) void handleTripPlaceSelect(stop.place_id, false);
            else closePopup();
          }}
          onPreviewSelectionChange={setTripPreviewSelectionKey}
          onUnsavedChangesGuardChange={(guard) => {
            unsavedTripSettingsGuard.current = guard;
          }}
          onClose={() => {
            setTripPlannerOpen(false);
            setTripPlannerCollapsed(false);
            setActiveTrip(null);
            setActiveTripDayId(null);
            setActiveTripNightTarget(null);
            changeActiveTripAnchorTarget(null);
            setTripNightPopupId(null);
            setTripAnchorPopupTarget(null);
            setTripViewOnly(false);
            setTripPreviewSelectionKey(null);
            setHiddenTripDayIds(new Set());
          }}
        />
      </Suspense>
    ) : (
      <MapSidebar
        state={sidebarState}
        activeMapId={activeMapId}
        activeStatusId={activeStatusId}
        maps={maps}
        geographicPrefill={temporarySearchResult}
        coordinatePrefill={coordinatePrefill}
        draftPosition={draftPosition}
        onDraftPositionChange={setDraftPosition}
        onClose={() => {
          setCoordinatePrefill(null);
          setDraftPosition(null);
          setSelectedPlace(null);
          navigate(withMap("/", activeMapId, activeStatusId));
        }}
        onPlaceMutated={handleMutation}
        onPlaceDeleted={handleDeletePlace}
      />
    );

  const applyWorkspacePanelChange = (panel: WorkspacePanel) => {
    if (dashboardOpen) navigate(withMap("/", activeMapId, activeStatusId));
    if (panel !== "places" || tripPlannerOpen) {
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setActiveTrip(null);
      setActiveTripDayId(null);
      setActiveTripNightTarget(null);
      changeActiveTripAnchorTarget(null);
      setTripAnchorPopupTarget(null);
      setTripViewOnly(false);
      setHiddenTripDayIds(new Set());
    }
    if (panel === "places") setPlacesPanelCollapsed(false);
    else if (panel !== null) setCollapsedWorkspacePanel(null);
    openWorkspacePanel(panel);
  };

  const handleWorkspacePanelChange = (panel: WorkspacePanel) => {
    const guard = unsavedTripSettingsGuard.current;
    if (!guard) {
      applyWorkspacePanelChange(panel);
      return;
    }
    void guard().then((canLeave) => { if (canLeave) applyWorkspacePanelChange(panel); });
  };

  const toggleWorkspacePanelCollapsed = (
    panel: Exclude<WorkspacePanel, null>,
  ) => {
    if (panel === "places") {
      setPlacesPanelCollapsed((collapsed) => !collapsed);
      return;
    }
    if (workspacePanel === panel)
      setCollapsedWorkspacePanel((current) =>
        current === panel ? null : panel,
      );
    else void handleWorkspacePanelChange(panel);
  };

  const openTrips = (create = false) => {
    if (!activeMap) {
      setMapsError("Sélectionnez une carte avant de préparer une sortie.");
      return;
    }
    setSelectedPlace(null);
    setCoordinatePrefill(null);
    setDraftPosition(null);
    setTripViewOnly(false);
    setTripPlannerCollapsed(false);
    setPlacesPanelCollapsed(false);
    setHiddenTripDayIds(new Set());
    navigate(withMap("/", activeMapId, activeStatusId));
    setWorkspacePanel("places");
    setTripPlannerOpen(true);
    if (create) setCreateTripRequest((value) => value + 1);
  };

  const applyOpenDashboard = () => {
    setTripPlannerOpen(false);
    setSelectedPlace(null);
    setCoordinatePrefill(null);
    setDraftPosition(null);
    navigate(withMap("/dashboard", activeMapId, activeStatusId));
  };

  const openDashboard = () => {
    const guard = unsavedTripSettingsGuard.current;
    if (!guard) {
      applyOpenDashboard();
      return;
    }
    void guard().then((canLeave) => { if (canLeave) applyOpenDashboard(); });
  };

  return (
    <main className={`app-shell${dashboardOpen ? " dashboard-shell" : ""}`}>
      <MainNavigation
        activePanel={dashboardOpen ? null : workspacePanel}
        dashboardActive={dashboardOpen}
        tripPlanningActive={!dashboardOpen && tripPlannerOpen}
        onOpenDashboard={openDashboard}
        onPanelChange={handleWorkspacePanelChange}
        onWorkspacePanelToggle={toggleWorkspacePanelCollapsed}
        onPlacesPanelToggle={() =>
          setPlacesPanelCollapsed((collapsed) => !collapsed)
        }
        onOpenTrips={() => openTrips()}
        isAdmin={user?.is_admin === true}
        hasMaps={maps.length > 0}
      />
      <div className="app-body">
        <TopBar
          isMapWorkspace={isMapWorkspace}
          contextLabel={dashboardOpen ? t("dashboard.title") : undefined}
          markerCount={places.length}
          onMapAccessChanged={() => setRefreshVersion((value) => value + 1)}
          onOpenAdmin={openAdmin}
          onOpenRegistrationRequests={openRegistrationRequests}
        />
        <Routes>
          <Route
            path="/dashboard"
            element={
              <Suspense
                fallback={
                  <div
                    className="dashboard-page dashboard-page--state"
                    role="status"
                  >
                    Loading…
                  </div>
                }
              >
                <DashboardPage
                  maps={maps}
                  activeMapId={activeMapId}
                  onCreateMap={() => {
                    navigate(withMap("/", activeMapId, activeStatusId));
                    setWorkspacePanel("maps");
                    setCollapsedWorkspacePanel(null);
                    setCreateMapRequest((value) => value + 1);
                  }}
                  onCreatePlace={(mapId) => {
                    const target = maps.find((map) => map.id === mapId);
                    if (target?.can_edit === true) {
                      setWorkspacePanel("places");
                      navigate(withMap("/places/new", target.id, null));
                    }
                  }}
                  onImportKmz={(mapId) => {
                    const target = maps.find((map) => map.id === mapId);
                    if (
                      target?.can_import !== false &&
                      target?.can_edit === true
                    ) {
                      navigate(withMap("/", target.id, null));
                      setWorkspacePanel("places");
                      setPlacesPanelCollapsed(false);
                      setImportRequest((value) => value + 1);
                    }
                  }}
                  onCreateTrip={(mapId) => {
                    const target = maps.find((map) => map.id === mapId);
                    if (target?.can_edit === true) {
                      navigate(withMap("/", target.id, null));
                      setWorkspacePanel("places");
                      setPlacesPanelCollapsed(false);
                      setTripPlannerCollapsed(false);
                      setTripPlannerOpen(true);
                      setCreateTripRequest((value) => value + 1);
                    }
                  }}
                  onOpenPlace={(placeId, mapId) => {
                    setWorkspacePanel("places");
                    navigate(withMap(`/places/${placeId}`, mapId, null));
                  }}
                  onOpenTrip={(tripId, mapId) => {
                    navigate(withMap("/", mapId, null));
                    setWorkspacePanel("places");
                    setTripPlannerOpen(true);
                    setTripPlannerCollapsed(false);
                    void getTrip(tripId)
                      .then((loaded) => {
                        setActiveTrip(loaded);
                        setActiveTripDayId(loaded.days[0]?.id ?? null);
                      })
                      .catch((caught: unknown) =>
                        setTripNotice(
                          caught instanceof Error
                            ? caught.message
                            : "Unable to open this trip.",
                        ),
                      );
                  }}
                />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <Suspense
                fallback={
                  <main className="auth-loading" role="status">
                    Chargement de l’espace de travail…
                  </main>
                }
              >
                <MapPage
                  places={places}
                  canEdit={activeMap?.can_edit === true}
                  selectedPlaceId={selectedPlaceId}
                  initialView={mapView}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                  sidebarOpen={editorOpen || tripPlannerOpen}
                  sidebarResizable={tripPlannerOpen && !tripPlannerCollapsed}
                  tripPlanningActive={tripPlannerOpen}
                  tripPlannerCollapsed={tripPlannerCollapsed}
                  placeListOpen={workspacePanel !== null}
                  statuses={statuses}
                  focusRequest={focusRequest}
                  popupContent={popupContent}
                  activeCountryCode={activeMap?.country.iso_alpha2}
                  activeCountryId={activeMap?.country.id}
                  temporarySearchResult={temporarySearchResult}
                  draftPosition={draftPosition}
                  draftPlaceId={
                    sidebarState.mode === "edit" ? sidebarState.placeId : null
                  }
                  onDraftPositionChange={setDraftPosition}
                  onGeographicResultSelect={(result) => {
                    setTemporarySearchResult(result);
                    setFocusRequest({
                      id: ++focusSequence.current,
                      view: {
                        center: [result.latitude, result.longitude],
                        zoom: result.boundingBox ? 12 : 15,
                      },
                    });
                  }}
                  onGeographicResultClear={() => setTemporarySearchResult(null)}
                  geographicTripAddTargetLabel={activeTripGeographicTargetLabel}
                  onGeographicResultAddToTrip={(result) => void addGeographicResultToActiveTripTarget(result)}
                  onCreateFromGeographicResult={(result) => {
                    setCoordinatePrefill(null);
                    setDraftPosition({
                      latitude: result.latitude,
                      longitude: result.longitude,
                    });
                    setTemporarySearchResult(result);
                    navigate(
                      withMap("/places/new", activeMapId, activeStatusId),
                    );
                  }}
                  onCreateFromCoordinates={(latitude, longitude) => {
                    setCoordinatePrefill({ latitude, longitude });
                    setDraftPosition({ latitude, longitude });
                    setPlacesPanelCollapsed(true);
                    setFocusRequest({
                      id: ++focusSequence.current,
                      view: {
                        center: [latitude, longitude],
                        zoom: mapView.zoom,
                      },
                      centerInVisibleWorkspace: true,
                    });
                    navigate(
                      withMap("/places/new", activeMapId, activeStatusId),
                    );
                  }}
                  placeList={workspaceContent}
                  sidebar={rightSidebar}
                  trip={activeTrip}
                  tripViewOnly={tripViewOnly}
                  selectedTripStopId={tripPreviewStopId}
                  selectedTripTimelineKey={tripPreviewSelectionKey}
                  hiddenTripDayIds={hiddenTripDayIds}
                  activeTripDayId={activeTripDayId}
                  activeTripNightTarget={activeTripNightTarget}
                  placeSelectionMode={placeSelectionMode}
                  selectedPlaceIds={selectedPlaceIds}
                  onPlaceSelectionToggle={(placeId) =>
                    setSelectedPlaceIds((current) => {
                      const next = new Set(current);
                      if (next.has(placeId)) next.delete(placeId);
                      else next.add(placeId);
                      return next;
                    })
                  }
                  onTripCoordinateAdd={
                    tripPlannerOpen && activeMap?.can_edit === true
                      ? (dayId, latitude, longitude) =>
                          void addCoordinatesToTripDay(
                            dayId,
                            latitude,
                            longitude,
                          )
                      : undefined
                  }
                  tripNotice={tripNotice}
                  onBoundsChange={setBounds}
                  onViewChange={setMapView}
                  onPlaceSelect={handleSelect}
                  onPopupClose={closePopup}
                />
              </Suspense>
            }
          />
        </Routes>
      </div>
      {exportMap && (
        <Suspense fallback={null}>
          <KmzExportDialog
            poiMap={exportMap}
            onClose={() => setExportMap(null)}
          />
        </Suspense>
      )}
      {membersMap && (
        <Suspense fallback={null}>
          <MapMembersDialog
            poiMap={membersMap}
            onClose={() => setMembersMap(null)}
            onMapUpdated={(updated) =>
              setMaps((current) =>
                current.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              )
            }
          />
        </Suspense>
      )}
      {adminOpen && (
        <RequireAdmin>
          <Suspense
            fallback={
              <div className="account-overlay">
                <section
                  className="admin-console admin-console--loading"
                  role="status"
                >
                  Chargement de l’administration…
                </section>
              </div>
            }
          >
            <AdminConsole onClose={closeAdmin} />
          </Suspense>
        </RequireAdmin>
      )}
      {confirmationDialog}
    </main>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const isAuthenticationPage = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ].includes(location.pathname);

  useEffect(() => {
    const controller = new AbortController();
    void getSetupStatus(controller.signal)
      .then(setSetupStatus)
      .catch((caught: unknown) => {
        if (!isAbortError(caught)) {
          setSetupError(
            caught instanceof Error
              ? caught.message
              : "Initial setup status is unavailable.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  if (setupStatus === null) {
    return (
      <main className="auth-loading" aria-live="polite">
        {setupError ?? "Chargement de CartaVault…"}
      </main>
    );
  }
  if (setupStatus.required) {
    return (
      <SetupPage
        status={setupStatus}
        onCompleted={() => {
          setSetupStatus({ required: false, locked: true, checks: [] });
          navigate("/login", { replace: true });
        }}
      />
    );
  }

  if (loading)
    return (
      <main className="auth-loading" aria-live="polite">
        Chargement de CartaVault…
      </main>
    );
  if (location.pathname.startsWith("/invitations/"))
    return (
      <Routes>
        <Route path="/invitations/:token" element={<InvitationPage />} />
      </Routes>
    );
  if (user && isAuthenticationPage) return <Navigate to="/dashboard" replace />;
  if (user === null && location.pathname === "/login") return <LoginPage />;
  if (location.pathname === "/register") return <RegisterPage />;
  if (location.pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (location.pathname === "/reset-password") return <ResetPasswordPage />;
  if (user === null) return <Navigate to="/login" replace />;
  return (
    <RequireAuth>
      <WorkspaceApp />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
