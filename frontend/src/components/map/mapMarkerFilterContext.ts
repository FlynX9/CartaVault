import { createContext } from 'react'

export interface MapMarkerFilter {
  query: string
  categoryId: string
  statusId: string | null
  tagId: string
}

export const EMPTY_MAP_MARKER_FILTER: MapMarkerFilter = { query: '', categoryId: '', statusId: null, tagId: '' }

export const MapMarkerFilterContext = createContext<{ filter: MapMarkerFilter; setFilter: (filter: MapMarkerFilter) => void }>({ filter: EMPTY_MAP_MARKER_FILTER, setFilter: () => undefined })
