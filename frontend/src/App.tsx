import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { isNetworkFailure } from "./pwa/offlineData";
import { deleteMap, getMaps } from "./api/maps";
import { attachMediaToPlace } from "./api/media";
import { getMapPlaces, getPlaceDetails } from "./api/places";
import { areMapPlacesEqual } from "./components/map/mapPlaceEquality";
import { getStatuses } from "./api/statuses";
import { addTripArrival, addTripDeparture, addTripNight, addTripStop, deleteTripArrival, deleteTripDeparture, getTrip, restoreTripState, setTripAnchorPlace, updateTripArrival, updateTripDeparture, updateTripNight } from "./api/trips";
import { TopBar } from "./components/layout/TopBar";
import {
  MainNavigation,
  type WorkspacePanel,
} from "./components/layout/MainNavigation";
import { MobileNavigation, type MobileMapNavigationDestination } from "./components/layout/MobileNavigation";
import { useMobileNavigationViewport, MOBILE_NAVIGATION_MEDIA_QUERY } from "./components/layout/mobileNavigationViewport";
import { MapContextNavigation } from "./components/layout/MapContextNavigation";
import { OrganizationDialog } from "./components/layout/OrganizationDialog";
import {
  buildMapOpeningFocusRequest,
  getMapOpeningConfigurationKey,
} from "./components/map/mapOpeningFocus";
import { MapSidebar } from "./components/sidebar/MapSidebar";
import { PlacesPanel, TripPlacesPanel } from "./components/place-list/MapPlaceList";
import { KMZ_IMPORTED_EVENT } from "./components/imports/KmzImportHost";
import { PlaceMapPopup } from "./components/map-popup/PlaceMapPopup";
import { TripStopMapPopup } from "./components/map-popup/TripStopMapPopup";
import { TripNightMapPopup } from "./components/map-popup/TripNightMapPopup";
import { TripAnchorMapPopup } from "./components/map-popup/TripAnchorMapPopup";
import { TimelinePlaceDetail } from "./components/trips/TimelinePlaceDetail";
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
import { mapPath, readMapId, readStatusId, withMap } from "./utils/map";
import {
  deserializePlaceFilters,
  serializePlaceFilters,
} from "./places/placeFilters";
import { getTripMapBounds } from "./components/trips/tripMapBounds";
import type { TripTechnicalActions, UnsavedTripSettingsGuard } from "./components/trips/TripPlannerPanel";
import { TripsWorkspacePanel } from "./components/trips/TripsWorkspacePanel";
import { recordReversibleAction, WORKSPACE_CHANGED_EVENT } from "./ui/actionHistory";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import { useAuth } from "./auth/useAuth";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from "./pages/PasswordResetPages";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { getSetupStatus, type SetupStatus } from "./api/setup";
import { useConfirmDialog } from "./components/common/useConfirmDialog";
import { UnsavedNavigationBlocker } from "./components/navigation/UnsavedNavigationBlocker";
import { deriveNavigationMode } from "./navigation/navigationMode";
import { ThemeProvider } from "./theme/ThemeProvider";
import { DisplayDensityProvider } from "./theme/DisplayDensityProvider";
import { useI18n } from "./i18n/useI18n";
import { ALLOW_UNSAVED_NAVIGATION_EVENT, UNSAVED_CHANGE_EVENT } from "./hooks/useUnsavedChangeSignal";
import { PrivacyConsentBanner } from "./components/privacy/PrivacyConsentBanner";
import {
  AppLoadingScreen,
  useDelayedLoadingScreen,
} from "./components/loading/AppLoadingScreen";

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
const PlaceFieldSettingsDialog = lazy(async () => ({
  default: (await import("./components/maps/MapsWorkspacePanel"))
    .PlaceFieldSettingsDialog,
}));
const AnnotationTemplatesWorkspacePanel = lazy(async () => ({ default: (await import('./components/layout/AnnotationTemplatesWorkspacePanel')).AnnotationTemplatesWorkspacePanel }));
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

export type WorkspaceMode = 'map' | 'trip'
const WORKSPACE_CAPABILITIES = {
  map: { placesPanel: "map", tripsPanel: false, timelinePanel: false, selector: "maps", organization: true, mapTheme: true },
  trip: { placesPanel: "trip", tripsPanel: true, timelinePanel: true, selector: "trips", organization: false, mapTheme: true },
} as const;
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

function WorkspaceApp({ enableNavigationBlocker = false }: { enableNavigationBlocker?: boolean }) {
  const { confirm, confirmationDialog } = useConfirmDialog();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobileNavigation = useMobileNavigationViewport();
  const dashboardOpen = location.pathname === "/dashboard";
  const isMapWorkspace = !dashboardOpen;
  const adminOpen = location.pathname.startsWith("/admin");
  const locationPathRef = useRef(location.pathname);
  locationPathRef.current = location.pathname;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // AUD-008: /travels/:tripId is the single source of identity for the open
  // trip; every post-await state application must re-check this ref so a slow
  // response can never land under a different route.
  const routeTripIdRef = useRef<string | null>(null);
  const activeMapId = readMapId(location.pathname);
  const activeStatusId = readStatusId(location.search);
  const routeTripId = location.pathname.match(/^\/travels\/([^/]+)$/)?.[1] ?? null;
  routeTripIdRef.current = routeTripId;
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
    location.pathname.match(/^\/maps\/[^/]+\/places\/([^/]+)$/)?.[1] ?? null;
  const selectedRoutePlaceId = directPlaceId === "new" ? null : directPlaceId;
  const [maps, setMaps] = useState<PoiMap[]>([]);
  const [openedMapId, setOpenedMapId] = useState<string | null>(null);
  const activeMap = maps.find((item) => item.id === activeMapId) ?? null;
  const [statuses, setStatuses] = useState<PlaceStatusSummary[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PreviewPlace | MapPlace | null>(null);
  const [mobilePlaceDetailOpen, setMobilePlaceDetailOpen] = useState(false);
  const [mobilePlaceDetailOrigin, setMobilePlaceDetailOrigin] = useState<"list" | "map" | null>(null);
  const [placeSelectionMode, setPlaceSelectionMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(
    null,
  );
  const [workspacePanel, setWorkspacePanel] =
    useState<WorkspacePanel>("places");
  const [mobileMapTripsOpen, setMobileMapTripsOpen] = useState(false);
  const organizationPanelOpen = workspacePanel === "categories" || workspacePanel === "tags" || workspacePanel === "statuses" || workspacePanel === "annotation-templates";
  const globalWorkspaceOpen = workspacePanel === "maps" || workspacePanel === "trips" || workspacePanel === "media" || workspacePanel === "trash";
  const mapCanvasActive = isMapWorkspace && !globalWorkspaceOpen;
  const [navigationCollapsed, setNavigationCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("cartavault:navigation-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [placesPanelCollapsed, setPlacesPanelCollapsed] = useState(false);
  const [collapsedWorkspacePanel, setCollapsedWorkspacePanel] =
    useState<Exclude<WorkspacePanel, "places" | null> | null>(null);
  const restorePlacesPanelAfterEditor = useRef(false);
  const [removedPlaceId, setRemovedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mapOpening, setMapOpening] = useState(false);
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);
  const [tripTechnicalActions, setTripTechnicalActions] = useState<TripTechnicalActions | null>(null);
  const [tripPlannerCollapsed, setTripPlannerCollapsed] = useState(false);
  const [mapToolsPanelOpen, setMapToolsPanelOpen] = useState(false);
  const [mapLegendPanelOpen, setMapLegendPanelOpen] = useState(false);
  const [countryMaskEnabled, setCountryMaskEnabled] = useState(() => {
    try { return window.localStorage.getItem("cartavault:country-mask-enabled") !== "false"; } catch { return true; }
  });
  const openingMapIdRef = useRef<string | null>(null);
  const openingMapRequestStartedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useLayoutEffect(() => {
    if (!mapCanvasActive || activeMapId === null) {
      openingMapIdRef.current = null;
      openingMapRequestStartedRef.current = false;
      setMapOpening(false);
      return;
    }
    if (openingMapIdRef.current !== activeMapId) {
      openingMapIdRef.current = activeMapId;
      openingMapRequestStartedRef.current = false;
      setMapOpening(true);
    }
  }, [activeMapId, mapCanvasActive]);
  useEffect(() => {
    if (!mapOpening) return;
    if (isLoading) {
      openingMapRequestStartedRef.current = true;
      return;
    }
    if (openingMapRequestStartedRef.current) setMapOpening(false);
  }, [isLoading, mapOpening]);
  useEffect(() => {
    try {
      window.localStorage.setItem("cartavault:navigation-collapsed", String(navigationCollapsed));
    } catch {
      // The preference is optional when storage is unavailable.
    }
  }, [navigationCollapsed]);
  useEffect(() => {
    const openMediaUpload = (event: Event) => {
      const mapId = (event as CustomEvent<{ mapId?: string }>).detail?.mapId;
      window.dispatchEvent(new CustomEvent("cartavault:show-media-upload", { detail: { maps, mapId } }));
    };
    window.addEventListener("cartavault:open-media-upload", openMediaUpload);
    return () => window.removeEventListener("cartavault:open-media-upload", openMediaUpload);
  }, [maps]);
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
  const [pendingMediaAttachmentId, setPendingMediaAttachmentId] = useState<string | null>(null);
  const [draftPosition, setDraftPosition] = useState<DraftPosition | null>(
    null,
  );
  useEffect(() => {
    const startFromMedia = (event: Event) => {
      const detail = (event as CustomEvent<{ mediaId?: string; mapId?: string; latitude?: number | null; longitude?: number | null }>).detail;
      if (!detail?.mediaId) return;
      const sourceMap = maps.find((item) => item.id === detail.mapId);
      const latitude = detail.latitude ?? sourceMap?.effective_center_latitude ?? null;
      const longitude = detail.longitude ?? sourceMap?.effective_center_longitude ?? null;
      setPendingMediaAttachmentId(detail.mediaId);
      setTemporarySearchResult(null);
      setDraftPosition(null);
      setCoordinatePrefill(latitude != null && longitude != null ? { latitude, longitude } : null);
      setWorkspacePanel("places");
      setPlacesPanelCollapsed(false);
      navigate(withMap("/places/new", detail.mapId ?? null, activeStatusId));
    };
    window.addEventListener("cartavault:create-place-from-media", startFromMedia);
    return () => window.removeEventListener("cartavault:create-place-from-media", startFromMedia);
  }, [activeStatusId, maps, navigate]);
  const [exportMap, setExportMap] = useState<PoiMap | null>(null);
  const [membersMap, setMembersMap] = useState<PoiMap | null>(null);
  const [settingsMap, setSettingsMap] = useState<PoiMap | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const applyLoadedTrip = useCallback((requestedTripId: string, loaded: Trip) => {
    if (routeTripIdRef.current !== requestedTripId || loaded.id !== requestedTripId) return;
    setActiveTrip(loaded);
  }, []);
  const applyRefreshedTrip = useCallback((requestedTripId: string, loaded: Trip) => {
    if (loaded.id !== requestedTripId) return;
    if (routeTripIdRef.current === requestedTripId) {
      applyLoadedTrip(requestedTripId, loaded);
      return;
    }
    if (routeTripIdRef.current !== null) return;
    setActiveTrip((current) => current?.id === requestedTripId ? loaded : current);
  }, [applyLoadedTrip]);
  const [tripScreenPanels, setTripScreenPanels] = useState({ places: true, trip: true });
  const routeTrip = routeTripId !== null && activeTrip?.id === routeTripId ? activeTrip : null;
  // The canonical route is the single source of truth for the workspace kind:
  // /maps/:mapId opens the map workspace, /travels/:tripId opens the trip
  // workspace. A loaded trip or a remembered map never changes the mode.
  const workspaceMode: WorkspaceMode | null = routeTripId !== null
    ? "trip"
    : activeMapId !== null
      ? "map"
      : null;
  const workspaceCapabilities = workspaceMode === null ? null : WORKSPACE_CAPABILITIES[workspaceMode];
  const tripRouteLoading = workspaceMode === "trip" && routeTrip === null;
  const tripScreenActive = workspaceMode === "trip" && routeTrip !== null;
  const tripMap = maps.find((item) => item.id === routeTrip?.map_id) ?? null;
  const navigationMode = deriveNavigationMode({
    pathname: location.pathname,
    maps,
    rememberedMapId: openedMapId,
    activeTrip: routeTrip,
  });
  const mapScopedMediaId = navigationMode.kind === "MAP_MODE" && location.pathname === mapPath(navigationMode.mapId, "/media")
    ? navigationMode.mapId
    : undefined;
  const mapScopedTripsId = navigationMode.kind === "MAP_MODE" && location.pathname === mapPath(navigationMode.mapId, "/trips")
    ? navigationMode.mapId
    : undefined;
  useEffect(() => {
    if (!isMobileNavigation || navigationMode.kind !== "MAP_MODE") {
      setMobileMapTripsOpen(false);
    }
  }, [isMobileNavigation, location.pathname, navigationMode.kind]);
  const contextMap = navigationMode.kind === "MAP_MODE" ? navigationMode.map : null;
  const [tripStatuses, setTripStatuses] = useState<PlaceStatusSummary[]>([]);
  const [tripPlaces, setTripPlaces] = useState<MapPlace[]>([]);
  const [tripBounds, setTripBounds] = useState<MapBounds | null>(null);
  const [tripMapView, setTripMapView] = useState<MapView>(INITIAL_MAP_VIEW);
  const [tripFocusRequest, setTripFocusRequest] = useState<MapFocusRequest | null>(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripErrorMessage, setTripErrorMessage] = useState<string | null>(null);
  const previousTripMapConfig = useRef<string | null | undefined>(undefined);
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
  const tripTimelineRestoreState = useRef<{ tripPlannerOpen: boolean } | null>(null);
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
  const unsavedTripSettingsGuard = useRef<UnsavedTripSettingsGuard | null>(null);
  const [tripSettingsDirty, setTripSettingsDirty] = useState(false);
  const [poiUnsavedState, setPoiUnsavedState] = useState({ formDirty: false, pendingPhotos: false });
  const [localDraftSources, setLocalDraftSources] = useState<Set<string>>(() => new Set());
  const poiEditorDirty = poiUnsavedState.formDirty || poiUnsavedState.pendingPhotos;
  const hasUnsavedChanges = poiEditorDirty || tripSettingsDirty || localDraftSources.size > 0;
  const skipNextNavigationRef = useRef(false);

  useEffect(() => {
    const refreshImportedData = () => setRefreshVersion((value) => value + 1);
    window.addEventListener(KMZ_IMPORTED_EVENT, refreshImportedData);
    return () => window.removeEventListener(KMZ_IMPORTED_EVENT, refreshImportedData);
  }, []);

  useEffect(() => {
    const updatePoiUnsavedState = (event: Event) => {
      const detail = (event as CustomEvent<{ formDirty?: boolean; pendingPhotos?: boolean }>).detail;
      setPoiUnsavedState((current) => ({
        formDirty: typeof detail?.formDirty === "boolean" ? detail.formDirty : current.formDirty,
        pendingPhotos: typeof detail?.pendingPhotos === "boolean" ? detail.pendingPhotos : current.pendingPhotos,
      }));
    };
    document.addEventListener("cartavault:poi-editor-unsaved", updatePoiUnsavedState);
    return () => document.removeEventListener("cartavault:poi-editor-unsaved", updatePoiUnsavedState);
  }, []);

  useEffect(() => {
    const allowOnce = () => {
      skipNextNavigationRef.current = true;
      queueMicrotask(() => { skipNextNavigationRef.current = false; });
    };
    document.addEventListener(ALLOW_UNSAVED_NAVIGATION_EVENT, allowOnce);
    return () => document.removeEventListener(ALLOW_UNSAVED_NAVIGATION_EVENT, allowOnce);
  }, []);

  useEffect(() => {
    const updateLocalDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; dirty?: boolean }>).detail;
      if (!detail?.source || typeof detail.dirty !== "boolean") return;
      const source = detail.source;
      setLocalDraftSources((current) => {
        const next = new Set(current);
        if (detail.dirty) next.add(source);
        else next.delete(source);
        return next.size === current.size && [...next].every((item) => current.has(item)) ? current : next;
      });
    };
    document.addEventListener(UNSAVED_CHANGE_EVENT, updateLocalDraft);
    return () => document.removeEventListener(UNSAVED_CHANGE_EVENT, updateLocalDraft);
  }, []);

  const requestUnsavedLeave = useCallback(async () => {
    const tripGuard = unsavedTripSettingsGuard.current;
    if (tripGuard && !await tripGuard()) return false;
    if (!poiEditorDirty && localDraftSources.size === 0) return true;
    return confirm({
      title: t("workspace.unsaved.title"),
      message: t("workspace.unsaved.message"),
      confirmLabel: t("workspace.unsaved.discard"),
      cancelLabel: t("workspace.unsaved.cancel"),
      variant: "danger",
    });
  }, [confirm, localDraftSources.size, poiEditorDirty, t]);

  const runAfterUnsavedCheck = useCallback((action: () => void) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    void requestUnsavedLeave().then((canLeave) => {
      if (!canLeave) return;
      skipNextNavigationRef.current = true;
      try { action(); }
      finally { queueMicrotask(() => { skipNextNavigationRef.current = false; }); }
    });
  }, [hasUnsavedChanges, requestUnsavedLeave]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [hasUnsavedChanges]);
  const tripAddPending = useRef(new Set<string>());
  const tripNoticeTimer = useRef<number | null>(null);
  useEffect(() => {
    if (activeMapId !== null) setOpenedMapId(activeMapId);
  }, [activeMapId]);
  useEffect(() => {
    if (!routeTripId) return;
    const requestedTripId = routeTripId;
    const controller = new AbortController();
    let cancelled = false;
    setActiveTrip(null);
    setActiveTripDayId(null);
    setActiveTripNightTarget(null);
    changeActiveTripAnchorTarget(null);
    setTripNightPopupId(null);
    setTripAnchorPopupTarget(null);
    setTripPreviewStopId(null);
    setTripPreviewSelectionKey(null);
    setHiddenTripDayIds(new Set());
    setPlaceSelectionMode(false);
    setSelectedPlaceIds(new Set());
    void getTrip(routeTripId, controller.signal)
      .then((loaded) => {
        if (cancelled || controller.signal.aborted || routeTripIdRef.current !== requestedTripId || loaded.id !== requestedTripId) return;
        const requestedReturnMapId = new URLSearchParams(location.search).get("from_map")?.trim() ?? null;
        const requestedReturnMap = requestedReturnMapId ? maps.find((map) => map.id === requestedReturnMapId) : null;
        if (requestedReturnMapId && maps.length > 0 && (!requestedReturnMap || loaded.map_id !== requestedReturnMap.id)) {
          navigate(requestedReturnMap ? mapPath(requestedReturnMap.id, "/trips") : "/travels", { replace: true });
          return;
        }
        setActiveTrip(loaded);
        setOpenedMapId(loaded.map_id);
        setActiveTripDayId(loaded.days[0]?.id ?? null);
        setTripScreenPanels({ places: true, trip: true });
        setTripPlannerOpen(true);
        setTripPlannerCollapsed(false);
        setWorkspacePanel("trip");
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted || routeTripIdRef.current !== requestedTripId) return;
        navigate("/travels", { replace: true });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [changeActiveTripAnchorTarget, location.search, maps, navigate, routeTripId]);
  useEffect(() => {
    if (routeTripId !== null) return;
    // Outside the canonical trip route the trip workspace must not leak any
    // state into the map workspace: planner closed, no loaded trip, and no
    // leftover day/night/anchor targets from a previously opened trip.
    setTripPlannerOpen(false);
    setTripPlannerCollapsed(false);
    setTripViewOnly(false);
    setActiveTripDayId(null);
    setActiveTripNightTarget(null);
    changeActiveTripAnchorTarget(null);
    setTripNightPopupId(null);
    setTripAnchorPopupTarget(null);
    setTripPreviewStopId(null);
    setTripPreviewSelectionKey(null);
    setHiddenTripDayIds(new Set());
    setPlaceSelectionMode(false);
    setSelectedPlaceIds(new Set());
  }, [routeTripId, changeActiveTripAnchorTarget]);
  useEffect(() => {
    if (location.search.includes("map=")) {
      const search = new URLSearchParams(location.search);
      const legacyMapId = search.get("map")?.trim();
      if (!legacyMapId) return;
      search.delete("map");
      const suffix = location.pathname.match(/^\/places\/(.*)$/)?.[1];
      navigate({
        pathname: mapPath(legacyMapId, suffix ? `/places/${suffix}` : ""),
        search: search.toString() ? `?${search}` : "",
      }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);
  useEffect(() => {
    if (location.pathname === "/" && !new URLSearchParams(location.search).has("map")) {
      navigate("/dashboard", { replace: true });
    } else if (location.pathname === "/maps") setWorkspacePanel("maps");
    else if (location.pathname === "/travels") setWorkspacePanel("trips");
    else if (routeTripId) setWorkspacePanel("trip");
    else if (location.pathname === "/medias") setWorkspacePanel("media");
    else if (location.pathname === "/trash") setWorkspacePanel("trash");
    else if (activeMapId && location.pathname === mapPath(activeMapId, "/media")) setWorkspacePanel("media");
    else if (activeMapId && location.pathname === mapPath(activeMapId, "/trips")) setWorkspacePanel("trips");
    else if (location.pathname.endsWith("/categories")) setWorkspacePanel("categories");
    else if (location.pathname.endsWith("/tags")) setWorkspacePanel("tags");
    else if (location.pathname.endsWith("/statuses")) setWorkspacePanel("statuses");
    else if (location.pathname.endsWith("/annotations")) setWorkspacePanel("annotation-templates");
    else if (activeMapId) setWorkspacePanel("places");
  }, [activeMapId, location.pathname, location.search, navigate, routeTripId]);
  // The legacy "map=" query parameter is canonicalized to /maps/:mapId on
  // entry. It must never leak into navigations targeting another workspace:
  // keeping it would re-trigger the canonicalization and cancel the user's
  // navigation (for example clicking "Mes Cartes" while the URL is still
  // being rewritten). Place filters are preserved.
  const searchWithoutLegacyMap = useMemo(() => {
    if (!location.search.includes("map=")) return location.search;
    const params = new URLSearchParams(location.search);
    params.delete("map");
    const serialized = params.toString();
    return serialized ? `?${serialized}` : "";
  }, [location.search]);
  const openAdmin = useCallback(
    () => runAfterUnsavedCheck(() => navigate({ pathname: "/admin/general", search: searchWithoutLegacyMap })),
    [runAfterUnsavedCheck, searchWithoutLegacyMap, navigate],
  );
  const openRegistrationRequests = useCallback(() => {
    const search = new URLSearchParams(location.search);
    search.delete("map");
    search.set("admin_notification", "registration-requests");
    navigate({ pathname: "/admin/users", search: `?${search.toString()}` });
  }, [location.search, navigate]);
  const preAdminPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!adminOpen) preAdminPathRef.current = `${location.pathname}${location.search}`;
  }, [adminOpen, location.pathname, location.search]);
  const closeAdmin = useCallback(
    () => navigate(preAdminPathRef.current ?? "/dashboard"),
    [navigate],
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
          const requestedMapId = readMapId(locationPathRef.current);
          if (
            requestedMapId !== null &&
            !loaded.some((item) => item.id === requestedMapId)
          ) {
            navigateRef.current(
              "/maps",
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
    [],
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
    if (!mapCanvasActive || !activeMapId) {
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
  }, [activeMapId, mapCanvasActive, refreshVersion]);

  useEffect(() => {
    const configKey =
      activeMap === null ? null : getMapOpeningConfigurationKey(activeMap);
    if (previousMapConfig.current === configKey) return;
    previousMapConfig.current = configKey;
    focusedRoutePlaceId.current = null;
    suppressedRouteFocusPlaceId.current = null;
    setSelectedPlace(null);
    setPlaces([]);
    // Bounds describe the current viewport, not a particular map. Retain them
    // while changing workspace/map so a remounted MapPage can fetch immediately;
    // its MapBoundsWatcher will publish a replacement if the viewport changes.
    setRemovedPlaceId(null);
    if (activeMap) {
      setFocusRequest(
        buildMapOpeningFocusRequest(activeMap, ++focusSequence.current),
      );
    }
  }, [activeMapId, activeMap]);

  useEffect(() => {
    if (!mapCanvasActive || bounds === null || activeMapId === null) return;
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
    mapCanvasActive,
    loadMaps,
    placeFilters,
    refreshVersion,
  ]);

  useEffect(() => {
    const configKey = tripScreenActive && tripMap ? getMapOpeningConfigurationKey(tripMap) : null;
    if (previousTripMapConfig.current === configKey) return;
    previousTripMapConfig.current = configKey;
    setTripPlaces([]);
    setTripBounds(null);
    setTripErrorMessage(null);
    if (tripMap) setTripFocusRequest(buildMapOpeningFocusRequest(tripMap, ++focusSequence.current));
  }, [tripMap, tripScreenActive]);

  useEffect(() => {
    if (!tripScreenActive || !tripMap) {
      setTripStatuses([]);
      return;
    }
    const controller = new AbortController();
    void getStatuses(tripMap.id, controller.signal, { activeOnly: true })
      .then(setTripStatuses)
      .catch((error: unknown) => {
        if (!isAbortError(error)) setTripErrorMessage(error instanceof Error ? error.message : "Impossible de charger les statuts.");
      });
    return () => controller.abort();
  }, [refreshVersion, tripMap, tripScreenActive]);

  useEffect(() => {
    if (!tripScreenActive || !tripMap || tripBounds === null) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(async () => {
      setTripLoading(true);
      setTripErrorMessage(null);
      try {
        const visible = await getMapPlaces({ bounds: tripBounds, mapId: tripMap.id, filters: placeFilters, limit: 2000 }, controller.signal);
        if (sequence === requestSequence.current) {
          setTripPlaces((current) => areMapPlacesEqual(current, visible.items) ? current : visible.items);
          setTripErrorMessage(visible.truncated ? "Trop de lieux sont visibles. Zoomez pour affiner l’affichage." : null);
        }
      } catch (error) {
        if (!isAbortError(error) && sequence === requestSequence.current) setTripErrorMessage(error instanceof Error ? error.message : "Chargement impossible.");
      } finally {
        if (sequence === requestSequence.current) setTripLoading(false);
      }
    }, REQUEST_DEBOUNCE_MS);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [placeFilters, refreshVersion, tripBounds, tripMap, tripScreenActive]);

  useEffect(() => {
    if (selectedRoutePlaceId === null) {
      focusedRoutePlaceId.current = null;
      return;
    }
    if (activeMapId === null) return;
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
        if (place.map_id !== activeMapId) {
          focusedRoutePlaceId.current = null;
          suppressedRouteFocusPlaceId.current = null;
          setSelectedPlace(null);
          setPlaces((current) => current.filter((item) => item.id !== selectedRoutePlaceId));
          const serializedSearch = new URLSearchParams(location.search).toString();
          navigate(
            {
              pathname: mapPath(activeMapId),
              search: serializedSearch ? `?${serializedSearch}` : "",
            },
            { replace: true },
          );
          return;
        }
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
  }, [activeMapId, location.search, navigate, places, selectedRoutePlaceId]);

  const handleMutation = (mutation: PlaceMutation) => {
    const mediaId = pendingMediaAttachmentId;
    if (mediaId !== null) {
      setPendingMediaAttachmentId(null);
      void attachMediaToPlace(mediaId, mutation.placeId).catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : "La photo n’a pas pu être rattachée au POI."),
      );
    }
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
    const setContextPlaces = tripScreenActive ? setTripPlaces : setPlaces;
    setContextPlaces((current) => current.filter((place) => place.id !== id));
    setSelectedPlace((current) => (current?.id === id ? null : current));
    setRemovedPlaceId(id);
    setRefreshVersion((value) => value + 1);
  };
  const applyPlaceSelection = (place: PreviewPlace | MapPlace, revealClusteredPlace = false, focusPlace = true, fromPlacesList = false) => {
    const isMobile = window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches === true;
    setSelectedPlace(place);
    setMobilePlaceDetailOpen(isMobile);
    setMobilePlaceDetailOrigin(isMobile ? (fromPlacesList ? "list" : "map") : null);
    if (isMobile && !fromPlacesList) setPlacesPanelCollapsed(true);
     if (tripScreenActive) setTripScreenPanels((current) => ({ ...current, places: true }));
     else setWorkspacePanel(tripViewOnly ? null : "places");
    suppressedRouteFocusPlaceId.current = focusPlace ? null : place.id;
    if (!tripScreenActive) {
      const placeMapId = "map_id" in place ? place.map_id : contextMap?.id;
      if (placeMapId) {
        navigate({ pathname: mapPath(placeMapId, `/places/${place.id}`), search: location.search });
      }
    }
    if (focusPlace && place.latitude !== null && place.longitude !== null) {
      focusedRoutePlaceId.current = place.id;
      const setContextFocus = tripScreenActive ? setTripFocusRequest : setFocusRequest;
      const contextView = tripScreenActive ? tripMapView : mapView;
      setContextFocus({
        id: ++focusSequence.current,
        view: {
          center: [place.latitude, place.longitude],
          zoom: revealClusteredPlace ? 19 : Math.max(contextView.zoom, 13),
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
    if (!routeTrip || contextMap?.can_edit !== true) return;
    const key = `anchor:${target}:${placeId}`;
    if (tripAddPending.current.has(key)) return;
    tripAddPending.current.add(key);
    try {
      const before = await getTrip(routeTrip.id);
      let loaded: Trip;
      try {
        loaded = await setTripAnchorPlace(routeTrip.id, target, placeId);
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status !== 404) throw caught;
        if (target === "departure") {
          const payload = { place_id: placeId, notes: before.departure?.notes ?? null, departure_time: before.departure?.departure_time ?? null };
          const saved = before.departure
            ? await updateTripDeparture(before.departure.id, payload)
            : await addTripDeparture(routeTrip.id, payload);
          loaded = { ...before, departure: saved };
        } else {
          const payload = { place_id: placeId, notes: before.arrival?.notes ?? null };
          const saved = before.arrival
            ? await updateTripArrival(before.arrival.id, payload)
            : await addTripArrival(routeTrip.id, payload);
          loaded = { ...before, arrival: saved };
        }
      }
      const savedAnchor = target === "departure" ? loaded.departure : loaded.arrival;
      if (savedAnchor?.place_id !== placeId) throw new Error("Le serveur n'a pas associé le POI demandé.");
      applyLoadedTrip(routeTrip.id, loaded);
      const restore = async (state: Trip) => { const restored = await restoreTripState(routeTrip.id, state); setActiveTrip(restored); };
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
    requestedTargetId?: string,
  ) => {
    if (workspaceCapabilities?.placesPanel !== "trip" || contextMap?.can_edit !== true) return;
    if (!routeTrip) {
      showTripNotice("Créez ou sélectionnez une sortie.");
      return;
    }
    if (routeTrip.status === "completed" || routeTrip.status === "archived")
      return;
    const anchorTarget = requestedTargetId === "departure" || requestedTargetId === "arrival"
      ? requestedTargetId
      : activeTripAnchorTargetRef.current;
    if (anchorTarget) {
      await replaceActiveTripAnchorWithPlace(anchorTarget, place.id);
      return;
    }
    const targetDayId = requestedTargetId?.startsWith("day:")
      ? requestedTargetId.slice(4)
      : requestedDayId ?? activeTripDayId;
    const nightTargetParts = requestedTargetId?.startsWith("night:")
      ? requestedTargetId.split(":")
      : null;
    const nightTarget = nightTargetParts?.length === 3
      ? {
          nightId: routeTrip.nights.find((night) => night.previous_day_id === nightTargetParts[1] && night.next_day_id === nightTargetParts[2])?.id ?? null,
          previousDayId: nightTargetParts[1],
          nextDayId: nightTargetParts[2],
        }
      : activeTripNightTarget;
    if (!nightTarget && (
      !targetDayId ||
      !routeTrip.days.some((day) => day.id === targetDayId)
    )) {
      showTripNotice("Sélectionnez une destination du voyage.");
      return;
    }
    const key = nightTarget
      ? `night:${nightTarget.previousDayId}:${nightTarget.nextDayId}:${place.id}`
      : `day:${targetDayId}:${place.id}`;
    if (tripAddPending.current.has(key)) return;
    tripAddPending.current.add(key);
    try {
      const before = await getTrip(routeTrip.id);
      if (nightTarget) {
        const createdNight = nightTarget.nightId
          ? await updateTripNight(nightTarget.nightId, { place_id: place.id, source_type: "place" })
          : await addTripNight(routeTrip.id, {
              previous_day_id: nightTarget.previousDayId,
              next_day_id: nightTarget.nextDayId,
              place_id: place.id,
              source_type: "place",
            });
        if (!requestedTargetId) setActiveTripNightTarget({ ...nightTarget, nightId: createdNight.id });
      } else {
        await addTripStop(targetDayId!, {
          place_id: place.id,
          stop_type: "place",
        });
      }
      const loaded = await getTrip(routeTrip.id);
      applyLoadedTrip(routeTrip.id, loaded);
      const restore = async (state: Trip) => { if (routeTripIdRef.current !== routeTrip.id) return; const restored = await restoreTripState(routeTrip.id, state); applyLoadedTrip(routeTrip.id, restored); };
      recordReversibleAction({ label: nightTarget ? `ajout du POI « ${place.name} » à la nuit` : `ajout du POI « ${place.name} » à la journée`, undo: () => restore(before), redo: () => restore(loaded) });
      const day = loaded.days.find((item) => item.id === targetDayId);
      if (!nightTarget) setActiveTripDayId(targetDayId);
      showTripNotice(
        nightTarget
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
  const handleSelect = (place: PreviewPlace | MapPlace, revealClusteredPlace = false, focusPlace = true, fromPlacesList = false) => {
    if (poiEditorDirty && place.id !== selectedRoutePlaceId) {
      runAfterUnsavedCheck(() => applyPlaceSelection(place, revealClusteredPlace, focusPlace, fromPlacesList));
      return;
    }
    applyPlaceSelection(place, revealClusteredPlace, focusPlace, fromPlacesList);
  };
  const tripPlaceTargets = workspaceCapabilities?.placesPanel === "trip" && routeTrip && contextMap?.can_edit === true && routeTrip.status !== "completed" && routeTrip.status !== "archived"
    ? [
        { id: "departure", label: "Départ" },
        ...routeTrip.days.flatMap((day, index) => [
          { id: `day:${day.id}`, label: `Jour ${day.day_number}` },
          ...(routeTrip.days[index + 1] ? [{ id: `night:${day.id}:${routeTrip.days[index + 1].id}`, label: `Nuit ${day.day_number}` }] : []),
        ]),
        { id: "arrival", label: "Arrivée" },
      ]
    : [];
  const addGeographicResultToActiveTripTarget = async (result: GeocodingResult) => {
    if (!tripPlannerOpen || contextMap?.can_edit !== true) return;
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
      applyLoadedTrip(activeTrip.id, loaded);
      const restore = async (state: Trip) => { if (routeTripIdRef.current !== activeTrip.id) return; const restored = await restoreTripState(activeTrip.id, state); applyLoadedTrip(activeTrip.id, restored); };
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
      contextMap?.can_edit !== true ||
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
      applyLoadedTrip(activeTrip.id, loaded);
      const restore = async (state: Trip) => { if (routeTripIdRef.current !== activeTrip.id) return; const restored = await restoreTripState(activeTrip.id, state); applyLoadedTrip(activeTrip.id, restored); };
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
      if (poiMap.id === openedMapId) setOpenedMapId(null);
      if (poiMap.id === activeMapId)
        navigate("/maps");
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
  const selectedPlaceId = workspaceMode === "trip"
    ? selectedPlace?.id ?? null
    : getSidebarPlaceId(sidebarState);
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
    setPlaceSelectionMode(false);
    setSelectedPlaceIds(new Set());
  }, [activeMapId]);
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
    setMobilePlaceDetailOpen(false);
    setMobilePlaceDetailOrigin(null);
    setSelectedPlace(null);
    if (workspaceMode === "trip") return;
    if (sidebarState.mode === "details" || sidebarState.mode === "preview") {
      if (activeMapId) navigate({ pathname: mapPath(activeMapId), search: location.search });
    }
  };
  const showSelectedPlaceOnMap = () => {
    const place = selectedPlace;
    if (!place || place.latitude === null || place.longitude === null) {
      setMobilePlaceDetailOpen(false);
      setMobilePlaceDetailOrigin(null);
      return;
    }
    const { latitude, longitude } = place;
    setMobilePlaceDetailOpen(false);
    setMobilePlaceDetailOrigin(null);
    setWorkspacePanel("places");
    setPlacesPanelCollapsed(true);
    setSelectedPlace(null);
    navigate({ pathname: mapPath(activeMapId!), search: location.search });
    focusedRoutePlaceId.current = place.id;
    setFocusRequest({
      id: ++focusSequence.current,
      view: {
        center: [latitude, longitude],
        zoom: Math.max(mapView.zoom, 13),
      },
      centerInVisibleWorkspace: tripPlannerOpen,
    });
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
    contextMap?.can_edit === true &&
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
    tripPlannerOpen && contextMap?.can_edit === true && activeTrip !== null && activeTrip.status !== "completed" && activeTrip.status !== "archived"
      ? activeTripAnchorTarget === "departure"
        ? "Ajouter au départ"
        : activeTripAnchorTarget === "arrival"
          ? "Ajouter à l’arrivée"
          : activeTripAddTargetLabel
      : null;
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
  const applyActiveTripNightTarget = (target: TripNightTarget | null, openPopup = false) => {
    setActiveTripNightTarget(target);
    if (target) changeActiveTripAnchorTarget(null);
    if (openPopup) setTripAnchorPopupTarget(null);
    setTripNightPopupId(openPopup ? target?.nightId ?? null : null);
    if (openPopup && target?.nightId) closePopup();
  };
  const changeActiveTripNightTarget = (target: TripNightTarget | null, openPopup = false) => {
    const currentDraftSource = tripNightPopupId ? `trip-night-details:${tripNightPopupId}` : null;
    if (currentDraftSource && localDraftSources.has(currentDraftSource) && target?.nightId !== tripNightPopupId) {
      runAfterUnsavedCheck(() => applyActiveTripNightTarget(target, openPopup));
      return;
    }
    applyActiveTripNightTarget(target, openPopup);
  };
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
      applyLoadedTrip(activeTrip.id, after);
      setTripAnchorPopupTarget(null);
      const restore = async (state: Trip) => {
        if (routeTripIdRef.current !== activeTrip.id) return;
        await restoreTripState(activeTrip.id, state);
        applyLoadedTrip(activeTrip.id, await getTrip(activeTrip.id));
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
        canEdit={contextMap?.can_edit === true}
        onDelete={() => void deleteSelectedTripAnchor()}
        onClose={() => setTripAnchorPopupTarget(null)}
      />
    ) : selectedTripNight !== null ? (
      <TripNightMapPopup
        night={selectedTripNight}
        canEdit={contextMap?.can_edit === true}
        onUpdated={(updated) => setActiveTrip((current) => current === null ? null : ({ ...current, nights: current.nights.map((night) => night.id === updated.id ? updated : night) }))}
        onClose={() => runAfterUnsavedCheck(() => setTripNightPopupId(null))}
      />
    ) : selectedPlaceId !== null && !editorOpen ? (
      tripViewOnly ? <TimelinePlaceDetail
        placeId={selectedPlaceId}
        canEdit={contextMap?.can_edit === true}
        onUpdated={() => setRefreshVersion((value) => value + 1)}
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
      /> : <PlaceMapPopup
        placeId={selectedPlaceId}
        canEdit={contextMap?.can_edit === true}
        allowPhotoPaste={workspaceCapabilities?.placesPanel === "map"}
        showManagementActions={workspaceCapabilities?.placesPanel === "map"}
        showHistoryAction={workspaceCapabilities?.placesPanel === "map"}
        tripAddTargetLabel={popupTripAddTargetLabel}
        tripTargets={tripPlaceTargets}
        tripDays={
          workspaceCapabilities?.placesPanel === "trip" &&
          contextMap?.can_edit === true &&
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
        onUpdated={() => setRefreshVersion((value) => value + 1)}
        onEdit={() => navigate(withMap(`/places/${selectedPlaceId}/edit`, activeMapId, activeStatusId))}
        onDeleted={(id) => { handleDeletePlace(id); navigate(withMap("/", activeMapId, activeStatusId)); }}
        onShowOnMap={mobilePlaceDetailOrigin === "list" ? showSelectedPlaceOnMap : undefined}
        onClose={closePopup}
      />
    ) : selectedPreviewStop && selectedPreviewStop.place_id === null ? (
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
          onCloseActive={closeMapFromNavigation}
          onDelete={(poiMap) => void deleteWorkspaceMap(poiMap)}
          onCreated={(poiMap) => {
            setMaps((current) => [...current, poiMap]);
            navigate(withMap("/", poiMap.id, activeStatusId));
            setWorkspacePanel("places");
          }}
          onUpdated={(poiMap, mode) => {
            setMaps((current) => mode === "duplicate" ? [...current, poiMap] : current.map((item) => item.id === poiMap.id ? poiMap : item));
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
      ) : mobileMapTripsOpen || workspacePanel === "trips" ? (
        <TripsWorkspacePanel
          maps={maps}
          mapId={mapScopedTripsId}
          fixedMapId={mapScopedTripsId}
          activeTripId={routeTripId}
          onOpen={(item) => {
            // AUD-008: the route effect is the single canonical loader.
            if (mapScopedTripsId && item.map_id !== mapScopedTripsId) return;
            navigate(mapScopedTripsId
              ? { pathname: `/travels/${item.id}`, search: `?from_map=${encodeURIComponent(mapScopedTripsId)}` }
              : `/travels/${item.id}`);
          }}
          onCloseActive={closeTripFromNavigation}
        />
      ) : workspacePanel === "places" || workspacePanel === "trip" || organizationPanelOpen ? (
        workspaceCapabilities?.placesPanel === "trip" && routeTrip ? <TripPlacesPanel
          tripId={routeTrip.id}
          poiMap={contextMap}
          statuses={tripScreenActive ? tripStatuses : statuses}
          filters={placeFilters}
          selectedPlaceId={selectedPlaceId}
          refreshVersion={refreshVersion}
          removedPlaceId={removedPlaceId}
          collapsed={placesPanelCollapsed}
          onCollapsedChange={setPlacesPanelCollapsed}
          onFiltersChange={(filters: PlaceFilters) => {
            window.localStorage.setItem("cartavault:place-sort", JSON.stringify({ sortBy: filters.sortBy, sortDirection: filters.sortDirection }));
            const params = serializePlaceFilters(filters);
            params.delete("map");
            navigate({
              pathname: location.pathname,
              search: params.toString() ? `?${params}` : "",
            });
          }}
          onPlaceSelect={(place) => handleSelect(place, true, true, true)}
          onPlaceCollapse={closePopup}
          onPlaceDeleted={(placeId) => {
            handleDeletePlace(placeId);
          }}
          onImported={() => setRefreshVersion((value) => value + 1)}
          onBulkChanged={() => setRefreshVersion((value) => value + 1)}
          onBulkTripChanged={(tripId) => {
            if (activeTrip?.id === tripId)
              void getTrip(tripId)
                .then((loaded) => applyRefreshedTrip(tripId, loaded))
                .catch((caught: unknown) =>
                  showTripNotice(
                    caught instanceof Error
                      ? caught.message
                      : "Impossible de rafraîchir la sortie.",
                  ),
                );
          }}
          tripPlaceDropEnabled={contextMap?.can_edit === true && routeTrip.status !== "completed" && routeTrip.status !== "archived"}
          tripTargets={tripPlaceTargets}
          onAddToTripTarget={(place, targetId) => addPlaceToActiveTripTarget(place, undefined, targetId)}
          selectionMode={placeSelectionMode}
          selectedPlaceIds={selectedPlaceIds}
          onSelectionModeChange={setPlaceSelectionMode}
          onSelectedPlaceIdsChange={setSelectedPlaceIds}
          importRequest={importRequest}
        /> : <PlacesPanel
          poiMap={contextMap}
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
            params.delete("map");
            navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" });
          }}
          onPlaceSelect={(place) => handleSelect(place, true, true, true)}
          onPlaceCollapse={closePopup}
          onPlaceDeleted={(placeId) => { handleDeletePlace(placeId); navigate(withMap("/", activeMapId, activeStatusId)); }}
          onImported={() => setRefreshVersion((value) => value + 1)}
          onBulkChanged={() => setRefreshVersion((value) => value + 1)}
          onBulkTripChanged={(tripId) => {
            if (activeTrip?.id === tripId) void getTrip(tripId).then((loaded) => applyRefreshedTrip(tripId, loaded)).catch((caught: unknown) => showTripNotice(caught instanceof Error ? caught.message : "Impossible de rafraîchir la sortie."));
          }}
          selectionMode={placeSelectionMode}
          selectedPlaceIds={selectedPlaceIds}
          onSelectionModeChange={setPlaceSelectionMode}
          onSelectedPlaceIdsChange={setSelectedPlaceIds}
          importRequest={importRequest}
        />
      ) : workspacePanel === "media" ? (
        <MediaWorkspacePanel
          key={mapScopedMediaId ?? "global"}
          mapId={mapScopedMediaId}
          collapsed={collapsedWorkspacePanel === "media"}
          onCollapsedChange={(collapsed) =>
            setCollapsedWorkspacePanel(collapsed ? "media" : null)
          }
          onOpenPlace={(media) => {
            if (!media.place) return;
            setWorkspacePanel("places");
            navigate(withMap(`/places/${media.place.id}`, media.map?.id ?? null, null));
          }}
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
  const organizationDialog = organizationPanelOpen && activeMapId !== null ? (
    <OrganizationDialog
      label={workspacePanel === "categories" ? t("nav.categories") : workspacePanel === "tags" ? t("nav.tags") : workspacePanel === "statuses" ? t("nav.statuses") : t("nav.annotations")}
      onClose={() => {
        setWorkspacePanel("places");
        navigate({ pathname: mapPath(activeMapId), search: location.search });
      }}
    >
      <Suspense fallback={null}>
        {workspacePanel === "categories" ? (
          <CategoriesWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} onClose={() => navigate({ pathname: mapPath(activeMapId), search: location.search })} />
        ) : workspacePanel === "tags" ? (
          <TagsWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} onClose={() => navigate({ pathname: mapPath(activeMapId), search: location.search })} />
        ) : workspacePanel === "statuses" ? (
          <StatusesWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} onClose={() => navigate({ pathname: mapPath(activeMapId), search: location.search })} />
        ) : (
          <AnnotationTemplatesWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} onClose={() => navigate({ pathname: mapPath(activeMapId), search: location.search })} />
        )}
      </Suspense>
    </OrganizationDialog>
  ) : null;

  const handleTripStopFocus = (latitude: number, longitude: number) => {
    const setContextFocus = tripScreenActive ? setTripFocusRequest : setFocusRequest;
    const contextView = tripScreenActive ? tripMapView : mapView;
    setContextFocus({
      id: ++focusSequence.current,
      view: { center: [latitude, longitude], zoom: Math.max(contextView.zoom, 15) },
    });
  };
  const changeTripViewOnly = (enabled: boolean) => {
    if (enabled && !tripViewOnly) {
      tripTimelineRestoreState.current = { tripPlannerOpen };
    }
    if (!enabled) {
      const restoreState = tripTimelineRestoreState.current;
      tripTimelineRestoreState.current = null;
      if (restoreState && !restoreState.tripPlannerOpen) {
        setTripPlannerOpen(false);
        setTripPlannerCollapsed(false);
        setTripAnchorPopupTarget(null);
      }
    }
    setTripViewOnly(enabled);
    if (enabled) {
      const tripBounds = getTripMapBounds(activeTrip);
      if (tripBounds)
        setFocusRequest({
          id: ++focusSequence.current,
          bounds: tripBounds,
          maxZoom: 15,
        });
    }
  };
  const handleTripPlaceSelect = async (placeId: string, focusPlace = true) => {
    const visiblePlace = (tripScreenActive ? tripPlaces : places).find((item) => item.id === placeId);
    if (visiblePlace) {
      handleSelect(visiblePlace, false, focusPlace, true);
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
      const setContextPlaces = tripScreenActive ? setTripPlaces : setPlaces;
      setContextPlaces((current) =>
        current.some((item) => item.id === marker.id)
          ? current
          : [...current, marker],
      );
      handleSelect(marker, false, focusPlace, true);
    } catch (caught) {
      showTripNotice(
        caught instanceof Error
          ? caught.message
          : "Impossible d’ouvrir ce lieu.",
      );
    }
  };
  const renderTripPlanner = (timelineOnly: boolean) => (
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
          poiMap={contextMap!}
          trip={activeTrip}
          tripSelectorVisible={false}
          activeDayId={activeTripDayId}
          tripViewOnly={timelineOnly}
          hiddenDayIds={hiddenTripDayIds}
          collapsed={timelineOnly ? false : tripPlannerCollapsed}
          restoreCachedState={activeTrip !== null}
          onCollapsedChange={setTripPlannerCollapsed}
          onTripViewOnlyChange={changeTripViewOnly}
          onDayVisibilityChange={(dayId, visible) =>
            setHiddenTripDayIds((current) => {
              const next = new Set(current);
              if (visible) next.delete(dayId);
              else next.add(dayId);
              return next;
            })
          }
          onTripChange={(trip) => {
            setActiveTrip(trip);
            if (trip === null) {
              if (activeTrip !== null) {
                setActiveTripDayId(null);
                setTripPlannerOpen(false);
                setWorkspacePanel("places");
                navigate(withMap("/", activeTrip.map_id, activeStatusId));
              }
              return;
            }
            if (routeTripId !== trip.id) navigate(`/travels/${trip.id}`);
          }}
          onActiveDayChange={setActiveTripDayId}
          activeAnchorTarget={activeTripAnchorTarget}
          onActiveAnchorTargetChange={changeActiveTripAnchorTarget}
          onActiveNightTargetChange={changeActiveTripNightTarget}
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
            void handleTripPlaceSelect(placeId, !timelineOnly);
          }}
          onPreviewStopSelect={(stopId) => {
            setTripPreviewStopId(stopId);
            const stop = activeTrip?.days.flatMap((day) => day.stops).find((item) => item.id === stopId) ?? null;
            if (stop?.place_id) void handleTripPlaceSelect(stop.place_id, false);
            else closePopup();
          }}
          onPreviewSelectionChange={setTripPreviewSelectionKey}
          onUnsavedChangesGuardChange={timelineOnly ? undefined : (guard) => {
            unsavedTripSettingsGuard.current = guard;
            setTripSettingsDirty(guard !== null);
          }}
          onTechnicalActionsChange={timelineOnly ? undefined : setTripTechnicalActions}
           onClose={() => {
             tripTimelineRestoreState.current = null;
             setTripPlannerOpen(false);
            setTripPlannerCollapsed(false);
            setWorkspacePanel("places");
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
    );
  const rightSidebar =
    tripPlannerOpen && contextMap ? (!tripScreenActive || tripScreenPanels.trip ? renderTripPlanner(false) : null) : (
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
          runAfterUnsavedCheck(() => {
            const returnToMedia = pendingMediaAttachmentId !== null;
            setPendingMediaAttachmentId(null);
            setCoordinatePrefill(null);
            setDraftPosition(null);
            setSelectedPlace(null);
            if (returnToMedia) setWorkspacePanel("media");
            navigate(withMap("/", activeMapId, activeStatusId));
          });
        }}
        onPlaceMutated={handleMutation}
        onPlaceDeleted={handleDeletePlace}
      />
    );
  const timelineSidebar = tripPlannerOpen && contextMap && tripViewOnly ? renderTripPlanner(true) : null;

  const applyWorkspacePanelChange = (panel: WorkspacePanel) => {
    setMobileMapTripsOpen(false);
    const rememberedMapId = activeMapId ?? openedMapId;
    const panelPath = panel === "maps" ? "/maps"
      : panel === "trips" ? "/travels"
      : panel === "media" ? "/medias"
      : panel === "trash" ? "/trash"
      : panel === "categories" || panel === "tags" || panel === "statuses" || panel === "annotation-templates"
        ? rememberedMapId ? mapPath(rememberedMapId, `/${panel === "annotation-templates" ? "annotations" : panel}`) : null
        : panel === "places" && rememberedMapId ? mapPath(rememberedMapId) : null;
    // AUD-008: exactly one navigation per panel change. The former
    // "leave the dashboard through /" hop raced the / -> /dashboard
    // normalization and could swallow the user's click.
    if (panelPath && location.pathname !== panelPath) navigate({ pathname: panelPath, search: searchWithoutLegacyMap });
    else if (!panelPath && dashboardOpen) navigate(withMap("/", activeMapId, activeStatusId));
    if (panel !== null && panel !== "places" && panel !== "trip") {
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setTripAnchorPopupTarget(null);
    }
    if (panel === "places" && workspacePanel === "trip") {
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setTripViewOnly(false);
    }
    if (panel === "places") setPlacesPanelCollapsed(false);
    else if (panel !== null) setCollapsedWorkspacePanel(null);
    openWorkspacePanel(panel);
  };

  const handleWorkspacePanelChange = (panel: WorkspacePanel) => {
    runAfterUnsavedCheck(() => applyWorkspacePanelChange(panel));
  };

  const applyContextMapChange = (mapId: string) => {
    if (mapId === activeMapId) return;
    setMobileMapTripsOpen(false);
    setSelectedPlace(null);
    setCoordinatePrefill(null);
    setDraftPosition(null);
    tripTimelineRestoreState.current = null;
    setTripPlannerOpen(false);
    setTripPlannerCollapsed(false);
    setTripViewOnly(false);
    setPlacesPanelCollapsed(false);
    setCollapsedWorkspacePanel(null);
    setWorkspacePanel("places");
    const search = new URLSearchParams(searchWithoutLegacyMap);
    // These filters contain identifiers owned by the previous map. Generic
    // filters (query, dates, flags and sorting) remain valid across maps.
    search.delete("status");
    search.delete("statuses");
    search.delete("categories");
    search.delete("tags");
    const serializedSearch = search.toString();
    navigate({
      pathname: mapPath(mapId),
      search: serializedSearch ? `?${serializedSearch}` : "",
    });
  };

  const handleContextMapChange = (mapId: string) => {
    runAfterUnsavedCheck(() => applyContextMapChange(mapId));
  };

  const applyMobileMapNavigation = (destination: MobileMapNavigationDestination, mapId: string) => {
    if (navigationMode.kind !== "MAP_MODE" || navigationMode.mapId !== mapId) return;
    if (destination === "trips") {
      setMobileMapTripsOpen(false);
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setTripViewOnly(false);
      setWorkspacePanel("trips");
      const targetPath = mapPath(mapId, "/trips");
      if (location.pathname !== targetPath) navigate({ pathname: targetPath, search: searchWithoutLegacyMap });
      return;
    }
    setMobileMapTripsOpen(false);
    if (destination === "settings") {
      setSettingsMap(navigationMode.map);
      return;
    }
    setSelectedPlace(null);
    setMobilePlaceDetailOpen(false);
    setMobilePlaceDetailOrigin(null);
    setTripPlannerOpen(false);
    setTripPlannerCollapsed(false);
    setTripViewOnly(false);
    const destinationPanel: WorkspacePanel = destination === "places"
      ? "places"
      : destination === "media"
        ? "media"
        : destination === "categories"
          ? "categories"
          : destination === "tags"
            ? "tags"
            : destination === "statuses"
              ? "statuses"
              : "annotation-templates";
    const destinationSuffix = destination === "places"
      ? ""
      : destination === "map"
        ? ""
        : destination === "media"
          ? "/media"
          : `/${destination === "annotations" ? "annotations" : destination}`;
    setWorkspacePanel(destinationPanel);
    if (destination === "places") setPlacesPanelCollapsed(false);
    const targetPath = mapPath(mapId, destinationSuffix);
    if (location.pathname !== targetPath) {
      navigate({ pathname: targetPath, search: searchWithoutLegacyMap });
    }
  };

  const handleMobileMapNavigation = (destination: MobileMapNavigationDestination, mapId: string) => {
    runAfterUnsavedCheck(() => applyMobileMapNavigation(destination, mapId));
  };

  function closeTripFromNavigation() {
    const close = () => {
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setTripViewOnly(false);
      setMobileMapTripsOpen(false);
      setActiveTrip(null);
      setActiveTripDayId(null);
      setTripScreenPanels({ places: true, trip: true });
      const returnMapId = new URLSearchParams(location.search).get("from_map")?.trim() ?? null;
      const returnMap = returnMapId ? maps.find((map) => map.id === returnMapId) : null;
      if (returnMap && activeTrip?.map_id === returnMap.id) {
        setWorkspacePanel("trips");
        navigate(mapPath(returnMap.id, "/trips"));
      } else {
        setWorkspacePanel("places");
        navigate("/travels");
      }
    };
    runAfterUnsavedCheck(close);
  }

  function closeMapFromNavigation() {
    const close = () => {
      setTripPlannerOpen(false);
      setTripPlannerCollapsed(false);
      setTripViewOnly(false);
      setActiveTrip(null);
      setActiveTripDayId(null);
      setSelectedPlace(null);
      setOpenedMapId(null);
      setWorkspacePanel(null);
      navigate("/maps");
    };
    runAfterUnsavedCheck(close);
  }

  const toggleTripTimelineFromNavigation = () => {
    if (workspaceCapabilities?.timelinePanel !== true) return;
    if (tripViewOnly) {
      changeTripViewOnly(false);
      return;
    }
    if (tripPlannerOpen) changeTripViewOnly(true);
    else setTripViewOnly(true);
  };

  const applyOpenDashboard = () => {
    setTripPlannerOpen(false);
    setSelectedPlace(null);
    setCoordinatePrefill(null);
    setDraftPosition(null);
    navigate("/dashboard");
  };

  const openDashboard = () => {
    runAfterUnsavedCheck(applyOpenDashboard);
  };

  const navigationProps = {
    activePanel: dashboardOpen ? null : workspacePanel,
    dashboardActive: dashboardOpen,
    onOpenDashboard: openDashboard,
    onPanelChange: handleWorkspacePanelChange,
    collapsed: navigationCollapsed,
    onCollapsedChange: setNavigationCollapsed,
    maps,
    activeMapId: activeMapId ?? openedMapId,
    activeTrip,
    tripOpen: tripPlannerOpen,
    onOpenTrip: () => {
      if (!activeTrip) return;
      navigate(`/travels/${activeTrip.id}`);
      setTripScreenPanels({ places: true, trip: true });
      setWorkspacePanel('trip');
      setTripPlannerOpen(true);
      setTripPlannerCollapsed(false);
    },
    onCloseMap: closeMapFromNavigation,
    onCloseTrip: closeTripFromNavigation,
    onMapNavigation: handleMobileMapNavigation,
    mobileMapTripsOpen,
  };

  return (
    <main className={`app-shell${dashboardOpen ? " dashboard-shell" : ""}${navigationCollapsed ? " navigation-collapsed" : ""}`}>
      {enableNavigationBlocker && <UnsavedNavigationBlocker dirty={hasUnsavedChanges} requestLeave={requestUnsavedLeave} skipNextNavigationRef={skipNextNavigationRef} />}
      {isMobileNavigation
        ? <MobileNavigation {...navigationProps} navigationMode={navigationMode} activeTrip={routeTrip} tripOpen={tripScreenActive && tripPlannerOpen} />
        : <MainNavigation {...navigationProps} />}
      <div className={`app-body${!dashboardOpen && contextMap && !globalWorkspaceOpen ? ' has-map-context-navigation' : ''}`}>
        <TopBar
          isMapWorkspace={mapCanvasActive}
          contextLabel={dashboardOpen ? t("dashboard.title") : undefined}
          onMapAccessChanged={() => setRefreshVersion((value) => value + 1)}
          onOpenAdmin={openAdmin}
          onOpenRegistrationRequests={openRegistrationRequests}
        />
        {!dashboardOpen && contextMap && !globalWorkspaceOpen && <MapContextNavigation
          poiMap={contextMap}
          maps={maps}
           activePanel={workspacePanel}
           tripPlanningActive={tripPlannerOpen}
           tripScreenActive={tripScreenActive}
           activeTrip={activeTrip}
            onTripSelect={(tripId) => {
              if (tripId === activeTrip?.id) return;
              // AUD-008: the route effect is the single canonical loader.
              navigate(`/travels/${tripId}`);
            }}
            tripScreenPanels={tripScreenPanels}
          tripTimelineActive={tripViewOnly}
           tripTimelineAvailable={workspaceCapabilities?.timelinePanel === true}
          mapToolsPanelOpen={mapToolsPanelOpen}
          legendPanelOpen={mapLegendPanelOpen}
          countryMaskEnabled={countryMaskEnabled}
          tripTechnicalActions={tripTechnicalActions}
          onMapChange={handleContextMapChange}
          onPanelChange={handleWorkspacePanelChange}
           onTripTimelineToggle={toggleTripTimelineFromNavigation}
            onTripScreenPanelChange={(panel) => setTripScreenPanels((current) => ({ ...current, [panel]: !current[panel] }))}
          onImport={() => {
            setWorkspacePanel('places')
            setPlacesPanelCollapsed(false)
            setImportRequest((value) => value + 1)
          }}
          onExport={() => setExportMap(contextMap)}
          onSettings={() => setSettingsMap(contextMap)}
          onMembers={() => setMembersMap(contextMap)}
          onMapToolsPanelToggle={() => setMapToolsPanelOpen((current) => !current)}
          onLegendPanelToggle={() => setMapLegendPanelOpen((current) => !current)}
          onCountryMaskToggle={() => setCountryMaskEnabled((current) => {
            const next = !current;
            try { window.localStorage.setItem("cartavault:country-mask-enabled", String(next)); } catch { /* Optional preference. */ }
            return next;
          })}
        />}
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
                    navigate("/maps");
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
                    if (window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches === true) return;
                    const target = maps.find((map) => map.id === mapId);
                    if (
                      target?.can_import !== false &&
                      target?.can_edit === true
                    ) {
                      navigate(withMap("/", target.id, null));
                      setWorkspacePanel("places");
                       setTripScreenPanels({ places: true, trip: true });
                      setPlacesPanelCollapsed(false);
                      setImportRequest((value) => value + 1);
                    }
                  }}
                  onCreateTrip={(mapId) => {
                    const target = maps.find((map) => map.id === mapId);
                    if (target?.can_edit === true) {
                      navigate("/travels");
                      setWorkspacePanel("trips");
                    }
                  }}
                  onOpenPlace={(placeId, mapId) => {
                    setWorkspacePanel("places");
                    navigate(withMap(`/places/${placeId}`, mapId, null));
                  }}
                  onOpenTrip={(tripId) => {
                    // AUD-008: the route effect is the single canonical loader.
                    navigate(`/travels/${tripId}`);
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
                  globalWorkspaceOpen ? <div className="global-workspace-page" role="status">{t('common.loading')}</div> : <AppLoadingScreen mode="map" />
                }
              >
                {globalWorkspaceOpen ? <section className={`global-workspace-page global-workspace-page--${workspacePanel}`} aria-label={workspacePanel === 'maps' ? t('maps.title') : workspacePanel === 'trips' ? t('nav.trips') : workspacePanel === 'media' ? t('nav.media') : t('nav.trash')}>
                  {workspaceContent}
                </section> : tripRouteLoading ? <AppLoadingScreen mode="map" /> : <MapPage
                  activeMapId={tripScreenActive ? routeTrip?.map_id ?? null : activeMapId}
                  places={tripScreenActive ? tripPlaces : places}
                  canEdit={contextMap?.can_edit === true}
                  selectedPlaceId={selectedPlaceId}
                  initialView={tripScreenActive ? tripMapView : mapView}
                  isLoading={tripScreenActive ? tripLoading : isLoading}
                  mapOpening={tripScreenActive ? false : mapOpening}
                  errorMessage={tripScreenActive ? tripErrorMessage : errorMessage}
                   sidebarOpen={editorOpen || (tripPlannerOpen && (!tripScreenActive || tripScreenPanels.trip))}
                   sidebarResizable={tripPlannerOpen && (!tripScreenActive || tripScreenPanels.trip) && !tripPlannerCollapsed}
                  tripPlanningActive={tripPlannerOpen}
                  mapToolsPanelOpen={mapToolsPanelOpen}
                  legendPanelOpen={mapLegendPanelOpen}
                  countryMaskEnabled={countryMaskEnabled}
                  onMapToolsPanelClose={() => setMapToolsPanelOpen(false)}
                  onLegendPanelClose={() => setMapLegendPanelOpen(false)}
                  tripPlannerCollapsed={tripPlannerCollapsed}
                  placesPanelCollapsed={placesPanelCollapsed}
                    workspacePanelCollapsed={mobileMapTripsOpen || workspacePanel === "places" || workspacePanel === "trip" || organizationPanelOpen ? placesPanelCollapsed : collapsedWorkspacePanel === workspacePanel}
                   workspacePanelCanFillWidth={false}
                    workspacePanelId={mobileMapTripsOpen ? "trips" : workspacePanel === "trip" ? "trip" : organizationPanelOpen ? "places" : workspacePanel ?? "places"}
                  placeCreationActive={sidebarState.mode === "create"}
                    placeListOpen={mobileMapTripsOpen || workspacePanel === "places" || organizationPanelOpen || (workspacePanel === "trip" && tripScreenPanels.places)}
                  statuses={tripScreenActive ? tripStatuses : statuses}
                  focusRequest={tripScreenActive ? tripFocusRequest : focusRequest}
                  popupContent={popupContent}
                  showPlaceDetailInTimeline={tripViewOnly}
                  desktopPlaceDetailInline={selectedPlaceId !== null}
                  mobilePlaceDetailOpen={
                    (mobilePlaceDetailOpen && selectedPlaceId !== null && !editorOpen) ||
                    (tripPlannerOpen && (
                      selectedTripNight !== null ||
                      selectedTripAnchor !== null ||
                      (selectedPreviewStop !== null && selectedPreviewStop.place_id === null)
                    ))
                  }
                  activeCountryCode={contextMap?.country.iso_alpha2}
                  activeCountryId={contextMap?.country.id}
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
                   placeList={workspacePanel === "trip" && !tripScreenPanels.places ? null : workspaceContent}
                  sidebar={rightSidebar}
                  timelineSidebar={timelineSidebar}
                  trip={tripPlannerOpen ? activeTrip : null}
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
                  onPlaceSelectionModeChange={setPlaceSelectionMode}
                  onAreaSelectionApply={(placeIds, strategy) => {
                    setSelectedPlaceIds((current) => strategy === 'add' ? new Set([...current, ...placeIds]) : new Set(placeIds));
                    setPlaceSelectionMode(true);
                  }}
                  onTripCoordinateAdd={
                    workspaceCapabilities?.tripsPanel === true && contextMap?.can_edit === true
                      ? (dayId, latitude, longitude) =>
                          void addCoordinatesToTripDay(
                            dayId,
                            latitude,
                            longitude,
                          )
                      : undefined
                  }
                  tripNotice={tripNotice}
                  onBoundsChange={tripScreenActive ? setTripBounds : setBounds}
                  onViewChange={tripScreenActive ? setTripMapView : setMapView}
                  onPlaceSelect={handleSelect}
                  onPopupClose={closePopup}
                />}
              </Suspense>
            }
          />
        </Routes>
      </div>
      {organizationDialog}
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
      {settingsMap && (
        <Suspense fallback={null}>
          <PlaceFieldSettingsDialog
            poiMap={settingsMap}
            onClose={() => setSettingsMap(null)}
            onSaved={() => setRefreshVersion((value) => value + 1)}
          />
        </Suspense>
      )}
      {confirmationDialog}
      <PrivacyConsentBanner />
    </main>
  );
}

function AppContent({ enableNavigationBlocker = false }: { enableNavigationBlocker?: boolean }) {
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
    "/verify-email",
  ].includes(location.pathname);

  useEffect(() => {
    const controller = new AbortController();
    void getSetupStatus(controller.signal)
      .then(setSetupStatus)
      .catch((caught: unknown) => {
        if (isNetworkFailure(caught)) {
          setSetupStatus({ required: false, locked: true, checks: [] });
          return;
        }
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

  const initializationPending = setupStatus === null || loading;
  const showInitializationSplash = useDelayedLoadingScreen(initializationPending);

  if (initializationPending)
    return showInitializationSplash ? <AppLoadingScreen message={setupError ?? undefined} /> : null;
  if (showInitializationSplash) return <AppLoadingScreen />;
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

  if (location.pathname.startsWith("/invitations/"))
    return (
      <Routes>
        <Route path="/invitations/:token" element={<InvitationPage />} />
      </Routes>
    );
  if (user && isAuthenticationPage) return <Navigate to="/dashboard" replace />;
  if (user === null && location.pathname === "/login") return <LoginPage />;
  if (location.pathname === "/register") return <RegisterPage />;
  if (location.pathname === "/verify-email") return <VerifyEmailPage />;
  if (location.pathname === "/forgot-password") return <ForgotPasswordPage />;
  if (location.pathname === "/reset-password") return <ResetPasswordPage />;
  if (user === null) return <Navigate to="/login" replace />;
  return (
    <RequireAuth>
      <WorkspaceApp enableNavigationBlocker={enableNavigationBlocker} />
    </RequireAuth>
  );
}

export default function App({ enableNavigationBlocker = false }: { enableNavigationBlocker?: boolean }) {
  return (
    <ThemeProvider>
      <DisplayDensityProvider>
        <AppContent enableNavigationBlocker={enableNavigationBlocker} />
      </DisplayDensityProvider>
    </ThemeProvider>
  );
}
