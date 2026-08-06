import { createContext } from 'react'

import type { MapPlace } from '../../types/place'

export interface MapMarkerFilter {
  query: string
  categoryId: string
  statusId: string | null
  tagId: string
}

export const EMPTY_MAP_MARKER_FILTER: MapMarkerFilter = { query: '', categoryId: '', statusId: null, tagId: '' }

export function mapPlaceMatchesMarkerFilter(place: MapPlace, filter: MapMarkerFilter): boolean {
  return (filter.query === '' || place.name.toLocaleLowerCase().includes(filter.query.toLocaleLowerCase()))
    && (filter.categoryId === '' || place.category_ids.includes(filter.categoryId))
    && (filter.statusId === null || place.status.id === filter.statusId)
    && (filter.tagId === '' || place.tag_ids.includes(filter.tagId))
}

export const MapMarkerFilterContext = createContext<{ filter: MapMarkerFilter; setFilter: (filter: MapMarkerFilter) => void }>({ filter: EMPTY_MAP_MARKER_FILTER, setFilter: () => undefined })
