export const BASEMAP_PREFERENCE_KEY = "cartavault.basemap";

export const BASEMAP_IDS = [
  "cartavault-light",
  "cartavault-dark",
  "stadia-light",
  "stadia-dark",
  "google-roadmap",
  "satellite",
  "google-satellite",
  "mapbox-satellite",
  "osm",
] as const;

export type BasemapId = (typeof BASEMAP_IDS)[number];

interface BasemapCommonDefinition {
  id: BasemapId;
  label: string;
  shortLabel: string;
  attribution: string;
  maxZoom: number;
  enabled: boolean;
  requiresStadiaAuthentication: boolean;
}

export interface VectorBasemapDefinition extends BasemapCommonDefinition {
  kind: "vector";
  styleUrl: string;
  tileJsonUrl: string;
  glyphsUrl: string;
}

export interface RasterBasemapDefinition extends BasemapCommonDefinition {
  kind: "raster";
  url: string;
}

export interface GoogleBasemapDefinition extends BasemapCommonDefinition {
  kind: "google";
}

export type BasemapDefinition =
  VectorBasemapDefinition | RasterBasemapDefinition | GoogleBasemapDefinition;

export const DEFAULT_BASEMAP_ID: BasemapId = "osm";

export interface BasemapAvailability {
  "cartavault-light": boolean;
  "cartavault-dark": boolean;
  "stadia-light"?: boolean;
  "stadia-dark"?: boolean;
  "google-roadmap"?: boolean;
  satellite: boolean;
  "google-satellite"?: boolean;
  "mapbox-satellite"?: boolean;
  osm: boolean;
}

export interface BasemapUrls {
  lightStyle: string;
  darkStyle: string;
  openFreeMapTileJson: string;
  openFreeMapGlyphs: string;
  satellite: string;
  osm: string;
}

const DEFAULT_BASEMAP_URLS: BasemapUrls = {
  lightStyle: "/map-styles/cartavault-light.json",
  darkStyle: "/map-styles/cartavault-dark.json",
  openFreeMapTileJson: "about:blank",
  openFreeMapGlyphs: "/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf",
  satellite:
    "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg",
  osm: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

const openFreeMapAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · CartaVault';
const stadiaAttribution =
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const satelliteAttribution =
  "&copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver (Contains Copernicus Data) | " +
  stadiaAttribution;
const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function configuredUrl(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function enabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function configuredAvailability(): BasemapAvailability {
  return {
    "cartavault-light": enabled(import.meta.env.VITE_BASEMAP_LIGHT_ENABLED),
    "cartavault-dark": enabled(import.meta.env.VITE_BASEMAP_DARK_ENABLED),
    "stadia-light": enabled(import.meta.env.VITE_BASEMAP_SATELLITE_ENABLED),
    "stadia-dark": enabled(import.meta.env.VITE_BASEMAP_SATELLITE_ENABLED),
    "google-roadmap": true,
    satellite: enabled(import.meta.env.VITE_BASEMAP_SATELLITE_ENABLED),
    "google-satellite": true,
    "mapbox-satellite": true,
    osm: enabled(import.meta.env.VITE_BASEMAP_OSM_ENABLED),
  };
}

function configuredUrls(): BasemapUrls {
  return {
    lightStyle: configuredUrl(
      import.meta.env.VITE_BASEMAP_LIGHT_STYLE_URL,
      DEFAULT_BASEMAP_URLS.lightStyle,
    ),
    darkStyle: configuredUrl(
      import.meta.env.VITE_BASEMAP_DARK_STYLE_URL,
      DEFAULT_BASEMAP_URLS.darkStyle,
    ),
    openFreeMapTileJson: configuredUrl(
      import.meta.env.VITE_OPENFREEMAP_TILEJSON_URL,
      DEFAULT_BASEMAP_URLS.openFreeMapTileJson,
    ),
    openFreeMapGlyphs: configuredUrl(
      import.meta.env.VITE_OPENFREEMAP_GLYPHS_URL,
      DEFAULT_BASEMAP_URLS.openFreeMapGlyphs,
    ),
    satellite: configuredUrl(
      import.meta.env.VITE_BASEMAP_SATELLITE_URL,
      DEFAULT_BASEMAP_URLS.satellite,
    ),
    osm: configuredUrl(
      import.meta.env.VITE_BASEMAP_OSM_URL,
      DEFAULT_BASEMAP_URLS.osm,
    ),
  };
}

/** Builds reviewed sources. Vector CartaVault themes never receive a provider key. */
export function createBasemaps(
  availability = configuredAvailability(),
  urls = configuredUrls(),
): readonly BasemapDefinition[] {
  return [
    {
      kind: "vector",
      id: "cartavault-light",
      label: "CartaVault clair",
      shortLabel: "Clair",
      styleUrl: urls.lightStyle,
      tileJsonUrl: urls.openFreeMapTileJson,
      glyphsUrl: urls.openFreeMapGlyphs,
      attribution: openFreeMapAttribution,
      maxZoom: 20,
      enabled: availability["cartavault-light"],
      requiresStadiaAuthentication: false,
    },
    {
      kind: "google",
      id: "google-roadmap",
      label: "Google",
      shortLabel: "Clair",
      attribution: "&copy; Google",
      maxZoom: 22,
      enabled: availability["google-roadmap"] !== false,
      requiresStadiaAuthentication: false,
    },
    {
      kind: "vector",
      id: "cartavault-dark",
      label: "CartaVault sombre",
      shortLabel: "Sombre",
      styleUrl: urls.darkStyle,
      tileJsonUrl: urls.openFreeMapTileJson,
      glyphsUrl: urls.openFreeMapGlyphs,
      attribution: openFreeMapAttribution,
      maxZoom: 20,
      enabled: availability["cartavault-dark"],
      requiresStadiaAuthentication: false,
    },
    {
      kind: "raster",
      id: "stadia-light",
      label: "Stadia clair",
      shortLabel: "Clair",
      url: urls.satellite,
      attribution: stadiaAttribution,
      maxZoom: 20,
      enabled: availability["stadia-light"] ?? availability.satellite,
      requiresStadiaAuthentication: urls.satellite.includes("stadiamaps.com"),
    },
    {
      kind: "raster",
      id: "stadia-dark",
      label: "Stadia sombre",
      shortLabel: "Sombre",
      url: urls.satellite,
      attribution: stadiaAttribution,
      maxZoom: 20,
      enabled: availability["stadia-dark"] ?? availability.satellite,
      requiresStadiaAuthentication: urls.satellite.includes("stadiamaps.com"),
    },
    {
      kind: "google",
      id: "google-satellite",
      label: "Google Satellite",
      shortLabel: "Google",
      attribution: "&copy; Google",
      maxZoom: 22,
      enabled: availability["google-satellite"] !== false,
      requiresStadiaAuthentication: false,
    },
    {
      kind: "raster",
      id: "mapbox-satellite",
      label: "Mapbox Satellite",
      shortLabel: "Satellite",
      url: "about:blank",
      attribution:
        '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 22,
      enabled: availability["mapbox-satellite"] !== false,
      requiresStadiaAuthentication: false,
    },
    {
      kind: "raster",
      id: "satellite",
      label: "Stadia satellite",
      shortLabel: "Satellite",
      url: urls.satellite,
      attribution: satelliteAttribution,
      maxZoom: 20,
      enabled: availability.satellite,
      requiresStadiaAuthentication: urls.satellite.includes("stadiamaps.com"),
    },
    {
      kind: "raster",
      id: "osm",
      label: "OpenStreetMap Standard",
      shortLabel: "Clair",
      url: urls.osm,
      attribution: osmAttribution,
      maxZoom: 19,
      enabled: availability.osm,
      requiresStadiaAuthentication: false,
    },
  ];
}

export const BASEMAPS = createBasemaps();
export const AVAILABLE_BASEMAPS = BASEMAPS.filter((basemap) => basemap.enabled);

export function getBasemap(id: BasemapId): BasemapDefinition {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0];
}

export function parseBasemapId(value: unknown): BasemapId | null {
  return typeof value === "string" && BASEMAP_IDS.includes(value as BasemapId)
    ? (value as BasemapId)
    : null;
}

export function isBasemapAvailable(id: BasemapId): boolean {
  return getBasemap(id).enabled;
}

export function getThemeDefaultBasemapId(
  prefersDark = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
): BasemapId {
  void prefersDark;
  return isBasemapAvailable(DEFAULT_BASEMAP_ID)
    ? DEFAULT_BASEMAP_ID
    : (AVAILABLE_BASEMAPS[0]?.id ?? "osm");
}

export function resolveAvailableBasemapId(
  value: unknown,
  prefersDark?: boolean,
): BasemapId {
  const parsed = parseBasemapId(value);
  return parsed && isBasemapAvailable(parsed)
    ? parsed
    : getThemeDefaultBasemapId(prefersDark);
}

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadStoredBasemapPreference(
  storage: Storage | null = getStorage(),
): BasemapId | null {
  try {
    const parsed = parseBasemapId(storage?.getItem(BASEMAP_PREFERENCE_KEY));
    return parsed && isBasemapAvailable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadBasemapPreference(
  storage: Storage | null = getStorage(),
): BasemapId {
  return loadStoredBasemapPreference(storage) ?? getThemeDefaultBasemapId();
}

export function saveBasemapPreference(
  id: BasemapId,
  storage: Storage | null = getStorage(),
): boolean {
  try {
    storage?.setItem(BASEMAP_PREFERENCE_KEY, id);
    return storage !== null;
  } catch {
    return false;
  }
}
