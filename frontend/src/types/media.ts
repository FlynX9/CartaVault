export type MediaFileState = 'healthy' | 'missing' | 'error'

export interface MediaMapSummary {
  id: string
  name: string
  country_code: string
  country_name: string
}

export interface MediaPlaceSummary {
  id: string
  name: string
  region: string | null
}

export interface MediaUploaderSummary {
  id: string
  name: string
}

export interface MediaItem {
  id: string
  original_name: string | null
  caption: string | null
  taken_at: string | null
  created_at: string | null
  updated_at: string | null
  is_primary: boolean
  mime_type: string | null
  format: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  file_state: MediaFileState
  can_edit: boolean
  place: MediaPlaceSummary
  map: MediaMapSummary
  uploader: MediaUploaderSummary | null
}

export interface MediaPage {
  items: MediaItem[]
  page: number
  page_size: number
  total: number
  pages: number
  aggregates: {
    total_count: number
    total_size_bytes: number
    primary_count: number
    missing_count: number
    error_count: number
  }
  filters: {
    maps: MediaMapSummary[]
    formats: string[]
    uploaders: MediaUploaderSummary[]
  }
}

export interface MediaQuery {
  page: number
  pageSize: number
  query: string
  mapId: string
  countryCode: string
  format: string
  uploaderId: string
  primary: '' | 'true' | 'false'
  fileState: '' | MediaFileState
  createdFrom: string
  createdTo: string
  minSize: string
  maxSize: string
  minWidth: string
  minHeight: string
  sortBy: 'created_at' | 'updated_at' | 'size' | 'name' | 'place' | 'map'
  sortDirection: 'asc' | 'desc'
}
