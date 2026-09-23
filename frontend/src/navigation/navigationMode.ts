import type { PoiMap } from "../types/map";
import type { Trip } from "../types/trip";
import { readMapId } from "../utils/map";

export type NavigationMode =
  | {
      kind: "GLOBAL_MODE";
      rememberedMapId: string | null;
    }
  | {
      kind: "MAP_MODE";
      map: PoiMap;
      mapId: string;
    };

interface NavigationModeInput {
  pathname: string;
  maps: PoiMap[];
  rememberedMapId: string | null;
  activeTrip: Pick<Trip, "id" | "map_id"> | null;
}

export function deriveNavigationMode({
  pathname,
  maps,
  rememberedMapId,
  activeTrip,
}: NavigationModeInput): NavigationMode {
  const routeMapId = readMapId(pathname);
  const routeMap = routeMapId
    ? maps.find((map) => map.id === routeMapId) ?? null
    : null;
  if (routeMap) {
    return { kind: "MAP_MODE", map: routeMap, mapId: routeMap.id };
  }

  const routeTripId = pathname.match(/^\/travels\/([^/]+)$/)?.[1] ?? null;
  if (routeTripId && activeTrip?.id === routeTripId) {
    const tripMap = maps.find((map) => map.id === activeTrip.map_id) ?? null;
    if (tripMap) {
      return { kind: "MAP_MODE", map: tripMap, mapId: tripMap.id };
    }
  }

  return { kind: "GLOBAL_MODE", rememberedMapId };
}
