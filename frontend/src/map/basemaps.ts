export const BASEMAP_PREFERENCE_KEY = "cartavault.basemap";

export const ACTIVE_BASEMAP_IDS = [
  "openfreemap-light",
  "openfreemap-dark",
  "arcgis-satellite",
  "google-satellite",
  "osm",
  "offline-vector-light",
  "offline-vector-dark",
] as const;

export type BasemapId = (typeof ACTIVE_BASEMAP_IDS)[number]
  | "cartavault-light" | "cartavault-dark"
  | "stadia-light" | "stadia-dark" | "satellite"
  | "mapbox-satellite" | "google-map-tiles" | "google-satellite-tiles" | "google-roadmap";

interface BasemapCommonDefinition {
  id: BasemapId;
  label: string;
  shortLabel: string;
  attribution: string;
  maxZoom: number;
  enabled: boolean;
}

export interface VectorBasemapDefinition extends BasemapCommonDefinition {
  kind: "vector";
  source: "cartavault" | "remote-style";
  styleUrl: string;
  glyphsUrl: string;
}

export interface RasterBasemapDefinition extends BasemapCommonDefinition {
  kind: "raster";
  url: string;
}

export interface GoogleBasemapDefinition extends BasemapCommonDefinition {
  kind: "google";
}

export type BasemapDefinition = VectorBasemapDefinition | RasterBasemapDefinition | GoogleBasemapDefinition;
export const DEFAULT_BASEMAP_ID: BasemapId = "openfreemap-light";

export interface BasemapAvailability {
  "openfreemap-light"?: boolean;
  "openfreemap-dark"?: boolean;
  "arcgis-satellite"?: boolean;
  "google-satellite"?: boolean;
  osm: boolean;
  "offline-vector-light"?: boolean;
  "offline-vector-dark"?: boolean;
}

export interface BasemapUrls {
  lightStyle: string;
  darkStyle: string;
  openFreeMapLightStyle: string;
  openFreeMapDarkStyle: string;
  offlineGlyphs: string;
  osm: string;
}

const DEFAULT_BASEMAP_URLS: BasemapUrls = {
  lightStyle: "/map-styles/cartavault-light.json",
  darkStyle: "/map-styles/cartavault-dark.json",
  openFreeMapLightStyle: "https://tiles.openfreemap.org/styles/positron",
  openFreeMapDarkStyle: "https://tiles.openfreemap.org/styles/dark",
  offlineGlyphs: "/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf",
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

const openFreeMapAttribution = '&copy; <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const offlineAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · OpenMapTiles · CartaVault';
const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function configuredUrl(value: string | undefined, fallback: string): string { return value?.trim() || fallback; }
function enabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function configuredAvailability(): BasemapAvailability {
  return {
    "openfreemap-light": enabled(import.meta.env.VITE_OPENFREEMAP_ENABLED),
    "openfreemap-dark": enabled(import.meta.env.VITE_OPENFREEMAP_ENABLED),
    "arcgis-satellite": true,
    "google-satellite": true,
    "offline-vector-light": true,
    "offline-vector-dark": true,
    osm: enabled(import.meta.env.VITE_BASEMAP_OSM_ENABLED),
  };
}

function configuredUrls(): BasemapUrls {
  return {
    lightStyle: configuredUrl(import.meta.env.VITE_BASEMAP_LIGHT_STYLE_URL, DEFAULT_BASEMAP_URLS.lightStyle),
    darkStyle: configuredUrl(import.meta.env.VITE_BASEMAP_DARK_STYLE_URL, DEFAULT_BASEMAP_URLS.darkStyle),
    openFreeMapLightStyle: configuredUrl(import.meta.env.VITE_OPENFREEMAP_LIGHT_STYLE_URL, DEFAULT_BASEMAP_URLS.openFreeMapLightStyle),
    openFreeMapDarkStyle: configuredUrl(import.meta.env.VITE_OPENFREEMAP_DARK_STYLE_URL, DEFAULT_BASEMAP_URLS.openFreeMapDarkStyle),
    offlineGlyphs: configuredUrl(import.meta.env.VITE_OFFLINE_VECTOR_GLYPHS_URL, DEFAULT_BASEMAP_URLS.offlineGlyphs),
    osm: configuredUrl(import.meta.env.VITE_BASEMAP_OSM_URL, DEFAULT_BASEMAP_URLS.osm),
  };
}

export function createBasemaps(availability = configuredAvailability(), urls = configuredUrls()): readonly BasemapDefinition[] {
  const vector = (id: BasemapId, label: string, shortLabel: string, source: "cartavault" | "remote-style", styleUrl: string, attribution: string, isEnabled: boolean): VectorBasemapDefinition => ({
    kind: "vector", source, id, label, shortLabel, styleUrl,
    glyphsUrl: source === "cartavault" ? urls.offlineGlyphs : "",
    attribution, maxZoom: 20, enabled: isEnabled,
  });
  return [
    vector("openfreemap-light", "OpenFreeMap clair", "Clair", "remote-style", urls.openFreeMapLightStyle, openFreeMapAttribution, availability["openfreemap-light"] !== false),
    vector("openfreemap-dark", "OpenFreeMap sombre", "Sombre", "remote-style", urls.openFreeMapDarkStyle, openFreeMapAttribution, availability["openfreemap-dark"] !== false),
    { kind: "raster", id: "arcgis-satellite", label: "ArcGIS World Imagery", shortLabel: "Satellite", url: "about:blank", attribution: "Tiles &copy; Esri", maxZoom: 23, enabled: availability["arcgis-satellite"] !== false },
    { kind: "google", id: "google-satellite", label: "Google Satellite", shortLabel: "Google", attribution: "&copy; Google", maxZoom: 22, enabled: availability["google-satellite"] !== false },
    { kind: "raster", id: "osm", label: "OpenStreetMap Standard", shortLabel: "Clair", url: urls.osm, attribution: osmAttribution, maxZoom: 19, enabled: availability.osm },
    vector("offline-vector-light", "CartaVault hors ligne clair", "Clair", "cartavault", urls.lightStyle, offlineAttribution, availability["offline-vector-light"] !== false),
    vector("offline-vector-dark", "CartaVault hors ligne sombre", "Sombre", "cartavault", urls.darkStyle, offlineAttribution, availability["offline-vector-dark"] !== false),
  ];
}

export const BASEMAPS = createBasemaps();
export const AVAILABLE_BASEMAPS = BASEMAPS.filter((basemap) => basemap.enabled);

const LEGACY_BASEMAP_MIGRATIONS: Record<string, BasemapId> = {
  "cartavault-light": "openfreemap-light",
  "stadia-light": "openfreemap-light",
  "google-roadmap": "openfreemap-light",
  "cartavault-dark": "openfreemap-dark",
  "stadia-dark": "openfreemap-dark",
  "satellite": "arcgis-satellite",
  "stadia-satellite": "arcgis-satellite",
  "mapbox-satellite": "arcgis-satellite",
  "google-map-tiles": "google-satellite",
  "google-satellite-tiles": "google-satellite",
};

export function normalizeBasemapId(value: unknown): BasemapId | null {
  if (typeof value !== "string") return null;
  if (value in LEGACY_BASEMAP_MIGRATIONS) return LEGACY_BASEMAP_MIGRATIONS[value];
  return ACTIVE_BASEMAP_IDS.includes(value as (typeof ACTIVE_BASEMAP_IDS)[number]) ? value as BasemapId : null;
}
export function getBasemap(id: BasemapId): BasemapDefinition {
  const normalized = normalizeBasemapId(id) ?? DEFAULT_BASEMAP_ID;
  return BASEMAPS.find((basemap) => basemap.id === normalized) ?? BASEMAPS[0];
}
export const parseBasemapId = normalizeBasemapId;
export function isBasemapAvailable(id: BasemapId): boolean { return getBasemap(id).enabled; }
export function getThemeDefaultBasemapId(prefersDark = false): BasemapId {
  const preferred: BasemapId = prefersDark ? "openfreemap-dark" : DEFAULT_BASEMAP_ID;
  return isBasemapAvailable(preferred) ? preferred : "osm";
}
function getStorage(): Storage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
export function loadStoredBasemapPreference(storage: Storage | null = getStorage()): BasemapId | null {
  try { const parsed = parseBasemapId(storage?.getItem(BASEMAP_PREFERENCE_KEY)); return parsed && isBasemapAvailable(parsed) ? parsed : null; } catch { return null; }
}
export function loadBasemapPreference(storage: Storage | null = getStorage()): BasemapId { return loadStoredBasemapPreference(storage) ?? getThemeDefaultBasemapId(); }
export function resolveAvailableBasemapId(value: unknown, prefersDark?: boolean): BasemapId {
  const parsed = parseBasemapId(value); return parsed && isBasemapAvailable(parsed) ? parsed : getThemeDefaultBasemapId(prefersDark);
}
export function saveBasemapPreference(id: BasemapId, storage: Storage | null = getStorage()): boolean {
  try { storage?.setItem(BASEMAP_PREFERENCE_KEY, normalizeBasemapId(id) ?? DEFAULT_BASEMAP_ID); return storage !== null; } catch { return false; }
}
