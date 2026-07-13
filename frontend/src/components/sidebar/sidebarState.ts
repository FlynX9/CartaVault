import type { PreviewPlace } from '../../types/place'

export type MapSidebarState =
  | { mode: 'closed' }
  | { mode: 'preview'; place: PreviewPlace }
  | { mode: 'details'; placeId: string }
  | { mode: 'create' }
  | { mode: 'edit'; placeId: string }

export function deriveMapSidebarState(
  pathname: string,
  selectedPlace: PreviewPlace | null,
): MapSidebarState {
  if (pathname === '/places/new') return { mode: 'create' }

  const editMatch = pathname.match(/^\/places\/([^/]+)\/edit$/)
  if (editMatch?.[1]) return { mode: 'edit', placeId: editMatch[1] }

  const detailsMatch = pathname.match(/^\/places\/([^/]+)$/)
  if (detailsMatch?.[1]) return { mode: 'details', placeId: detailsMatch[1] }

  if (selectedPlace !== null) return { mode: 'preview', place: selectedPlace }
  return { mode: 'closed' }
}

export function getSidebarPlaceId(state: MapSidebarState): string | null {
  if (state.mode === 'preview') return state.place.id
  if (state.mode === 'details' || state.mode === 'edit') return state.placeId
  return null
}
