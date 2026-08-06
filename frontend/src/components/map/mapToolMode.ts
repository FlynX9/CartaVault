export type InternalMapToolMode = 'navigation' | 'measurement' | 'area-selection' | 'extent-drawing' | 'coordinates' | 'geolocation'
export type InteractiveMapMode = InternalMapToolMode | 'place-creation' | 'trip-planning' | 'point-selection'

export interface MapModeContext {
  internalMode: InternalMapToolMode
  placeCreationActive: boolean
  tripPlanningActive: boolean
  pointSelectionActive: boolean
}

export function resolveInteractiveMapMode(context: MapModeContext): InteractiveMapMode {
  if (context.placeCreationActive) return 'place-creation'
  if (context.tripPlanningActive) return 'trip-planning'
  if (context.pointSelectionActive) return 'point-selection'
  return context.internalMode
}

export function isTemporaryMapMode(mode: InteractiveMapMode): boolean {
  return mode === 'measurement' || mode === 'area-selection' || mode === 'extent-drawing' || mode === 'coordinates' || mode === 'geolocation'
}
